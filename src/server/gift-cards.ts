import crypto from "crypto";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, type DecimalLike } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { giftCardSchema } from "@/lib/validation";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";

export type GiftCardInput = z.infer<typeof giftCardSchema>;

export const giftCardInclude = {
  transactions: { orderBy: { createdAt: "desc" as const }, take: 20 },
} satisfies Prisma.GiftCardInclude;

/** Código numérico de 12 dígitos (se imprime como código de barras). */
function newCode() {
  return String(crypto.randomInt(1, 10)) + String(crypto.randomInt(0, 1e11)).padStart(11, "0");
}

/** Muestra solo los últimos 4 dígitos (el código completo funciona como dinero). */
export const maskCode = (code: string) => `••••${code.slice(-4)}`;

const normalizeCode = (code: string) => code.replace(/\D/g, "");

/** Emite un vale: el dinero recibido entra a la caja como pasivo, no como venta. */
export async function issueGiftCard(actor: Actor, input: GiftCardInput) {
  return prisma.$transaction(async (tx) => {
    const session = await getOpenSession(tx, actor.businessId);
    if (input.paymentMethod === "CASH" && !session) throw new AppError(409, "Abre la caja para cobrar en efectivo");
    const amount = money(input.amount);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const exists = await tx.giftCard.findUnique({
        where: { businessId_code: { businessId: actor.businessId, code } },
      });
      if (exists) continue;
      const card = await tx.giftCard.create({
        data: {
          code,
          initialAmount: amount,
          balance: amount,
          customerName: input.customerName,
          expiresAt: input.expiresAt ?? null,
          issuedById: actor.userId,
          businessId: actor.businessId,
          transactions: {
            create: {
              type: "ISSUE",
              amount,
              paymentMethod: input.paymentMethod,
              cashSessionId: input.paymentMethod === "CASH" ? session!.id : null,
              userId: actor.userId,
              businessId: actor.businessId,
            },
          },
        },
        include: giftCardInclude,
      });
      await audit(tx, actor, "giftCard.issue", "GiftCard", card.id, {
        amount: amount.toNumber(),
        code: maskCode(code),
      });
      return card;
    }
    throw new AppError(500, "No se pudo generar el código del vale; intenta de nuevo");
  });
}

export async function findGiftCard(businessId: string, code: string) {
  const card = await prisma.giftCard.findUnique({
    where: { businessId_code: { businessId, code: normalizeCode(code) } },
    include: giftCardInclude,
  });
  if (!card) throw notFound("Vale");
  return card;
}

export async function getGiftCard(businessId: string, id: string) {
  const card = await prisma.giftCard.findFirst({ where: { id, businessId }, include: giftCardInclude });
  if (!card) throw notFound("Vale");
  return card;
}

export async function listGiftCards(businessId: string, search?: string) {
  const digits = search ? normalizeCode(search) : "";
  return prisma.giftCard.findMany({
    where: {
      businessId,
      ...(search
        ? {
            OR: [
              ...(digits.length >= 4 ? [{ code: { endsWith: digits } }] : []),
              { customerName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Anula un vale (p. ej. extraviado): su saldo deja de poder usarse. No devuelve dinero. */
export async function voidGiftCard(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.findFirst({ where: { id, businessId: actor.businessId } });
    if (!card) throw notFound("Vale");
    const { count } = await tx.giftCard.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "VOID", balance: 0 },
    });
    if (count === 0) throw new AppError(409, "El vale ya está anulado");
    await tx.giftCardTransaction.create({
      data: {
        type: "VOID",
        amount: D(card.balance).neg(),
        giftCardId: id,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    await audit(tx, actor, "giftCard.void", "GiftCard", id, {
      code: maskCode(card.code),
      balance: D(card.balance).toNumber(),
    });
    return tx.giftCard.findUniqueOrThrow({ where: { id }, include: giftCardInclude });
  });
}

/** Cobra una venta con el vale (dentro de la transacción de la venta). */
export async function redeemGiftCard(tx: Tx, actor: Actor, code: string, amount: DecimalLike, saleId: string) {
  const card = await tx.giftCard.findUnique({
    where: { businessId_code: { businessId: actor.businessId, code: normalizeCode(code) } },
  });
  if (!card) throw new AppError(404, "No existe un vale con ese código");
  if (card.status !== "ACTIVE") throw new AppError(409, "El vale está anulado");
  if (card.expiresAt && card.expiresAt < new Date()) throw new AppError(409, "El vale está vencido");
  const total = money(amount);
  const { count } = await tx.giftCard.updateMany({
    where: { id: card.id, status: "ACTIVE", balance: { gte: total } },
    data: { balance: { decrement: total } },
  });
  if (count === 0) {
    throw new AppError(409, `El saldo del vale (${D(card.balance).toFixed(2)}) no alcanza para esta venta`);
  }
  await tx.giftCardTransaction.create({
    data: {
      type: "REDEEM",
      amount: total.neg(),
      saleId,
      giftCardId: card.id,
      userId: actor.userId,
      businessId: actor.businessId,
    },
  });
  return card;
}

/** Regresa saldo al vale por una devolución o cancelación. */
export async function refundGiftCard(tx: Tx, actor: Actor, giftCardId: string, amount: DecimalLike, saleId: string) {
  const total = money(amount);
  if (total.lte(0)) return;
  await tx.giftCard.update({ where: { id: giftCardId }, data: { balance: { increment: total } } });
  await tx.giftCardTransaction.create({
    data: { type: "REFUND", amount: total, saleId, giftCardId, userId: actor.userId, businessId: actor.businessId },
  });
}
