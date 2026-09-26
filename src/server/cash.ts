import { AppError, notFound } from "@/lib/errors";
import { D, money, sum } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "./inventory";

/** Turno de caja abierto del negocio (a lo más uno). */
export async function getOpenSession(db: Tx | typeof prisma, businessId: string) {
  return db.cashSession.findFirst({ where: { businessId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

/** Bloquea la fila del negocio para serializar apertura/cierre de caja. */
async function lockBusiness(tx: Tx, businessId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
}

export async function openCashSession(actor: Actor, input: { openingAmount: number; notes: string | null }) {
  return prisma.$transaction(async (tx) => {
    await lockBusiness(tx, actor.businessId);
    const open = await getOpenSession(tx, actor.businessId);
    if (open) throw new AppError(409, "Ya hay una caja abierta. Ciérrala antes de abrir otra.");

    const session = await tx.cashSession.create({
      data: {
        businessId: actor.businessId,
        openedById: actor.userId,
        openingAmount: money(input.openingAmount),
        notes: input.notes,
      },
    });
    await audit(tx, actor, "cash.open", "CashSession", session.id, { openingAmount: input.openingAmount });
    return session;
  });
}

/**
 * Resumen del turno: efectivo esperado = fondo inicial + ventas en efectivo
 * + abonos en efectivo + entradas + recargas y servicios en efectivo
 * − devoluciones en efectivo − salidas
 * − gastos y compras pagados de caja.
 */
export async function cashSessionSummary(db: Tx | typeof prisma, sessionId: string) {
  const session = await db.cashSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound("Turno de caja");

  // Consultas secuenciales: dentro de una transacción comparten una sola conexión.
  const salesByMethod = await db.sale.groupBy({
    by: ["paymentMethod"],
    where: { cashSessionId: sessionId, status: "ACTIVE" },
    _sum: { total: true },
    _count: true,
  });
  const cashReturns = await db.saleReturn.aggregate({
    where: { cashSessionId: sessionId, refundMethod: "CASH", sale: { status: "ACTIVE" } },
    _sum: { total: true },
  });
  const payments = await db.customerPayment.aggregate({
    where: { cashSessionId: sessionId, method: "CASH" },
    _sum: { amount: true },
  });
  const movements = await db.cashMovement.findMany({
    where: { cashSessionId: sessionId },
    orderBy: { createdAt: "asc" },
  });
  const expenses = await db.expense.aggregate({
    where: { cashSessionId: sessionId, paymentMethod: "CASH" },
    _sum: { amount: true },
  });
  const purchases = await db.purchase.aggregate({
    where: { cashSessionId: sessionId, paidFromCash: true, status: "ACTIVE" },
    _sum: { total: true },
  });
  // Recargas y pagos de servicios cobrados en efectivo (dinero del proveedor que está en la caja).
  const services = await db.serviceSale.aggregate({
    where: { cashSessionId: sessionId, paymentMethod: "CASH", status: "ACTIVE" },
    _sum: { amount: true },
  });

  const byMethod = Object.fromEntries(
    salesByMethod.map((s) => [s.paymentMethod, { total: D(s._sum.total), count: s._count }])
  ) as Record<string, { total: ReturnType<typeof D>; count: number }>;

  const cashSales = byMethod.CASH?.total ?? D(0);
  const cashIn = sum(movements.filter((m) => m.type === "IN").map((m) => m.amount));
  const cashOut = sum(movements.filter((m) => m.type === "OUT").map((m) => m.amount));
  const refunds = D(cashReturns._sum.total);
  const customerPayments = D(payments._sum.amount);
  const cashExpenses = D(expenses._sum.amount);
  const cashPurchases = D(purchases._sum.total);
  const serviceCash = D(services._sum.amount);
  // Vales vendidos en efectivo en este turno (pasivo: se canjearán después).
  const giftCards = await db.giftCardTransaction.aggregate({
    where: { cashSessionId: sessionId, type: "ISSUE", paymentMethod: "CASH" },
    _sum: { amount: true },
  });
  const giftCardCash = D(giftCards._sum.amount);

  const expected = money(
    D(session.openingAmount)
      .plus(cashSales)
      .plus(customerPayments)
      .plus(cashIn)
      .plus(serviceCash)
      .plus(giftCardCash)
      .minus(refunds)
      .minus(cashOut)
      .minus(cashExpenses)
      .minus(cashPurchases)
  );

  return {
    session,
    salesByMethod: byMethod,
    cashSales,
    customerPayments,
    cashIn,
    cashOut,
    refunds,
    cashExpenses,
    cashPurchases,
    serviceCash,
    giftCardCash,
    expected,
    movements,
  };
}

export async function addCashMovement(actor: Actor, input: { type: "IN" | "OUT"; amount: number; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const session = await getOpenSession(tx, actor.businessId);
    if (!session) throw new AppError(409, "No hay una caja abierta");
    const movement = await tx.cashMovement.create({
      data: {
        type: input.type,
        amount: money(input.amount),
        reason: input.reason,
        cashSessionId: session.id,
        businessId: actor.businessId,
        userId: actor.userId,
      },
    });
    await audit(tx, actor, "cash.movement", "CashMovement", movement.id, input);
    return movement;
  });
}

export async function closeCashSession(actor: Actor, input: { countedAmount: number; notes: string | null }) {
  return prisma.$transaction(async (tx) => {
    await lockBusiness(tx, actor.businessId);
    const session = await getOpenSession(tx, actor.businessId);
    if (!session) throw new AppError(409, "No hay una caja abierta");

    const summary = await cashSessionSummary(tx, session.id);
    const counted = money(input.countedAmount);
    const closed = await tx.cashSession.update({
      where: { id: session.id },
      data: {
        closedAt: new Date(),
        closedById: actor.userId,
        countedAmount: counted,
        expectedAmount: summary.expected,
        difference: counted.minus(summary.expected),
        notes: [session.notes, input.notes].filter(Boolean).join("\n") || null,
      },
    });
    await audit(tx, actor, "cash.close", "CashSession", session.id, {
      expected: summary.expected.toNumber(),
      counted: counted.toNumber(),
    });
    return { ...summary, session: closed };
  });
}
