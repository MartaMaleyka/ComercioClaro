import crypto from "crypto";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, sum, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayRange } from "@/lib/dates";
import type { listQuerySchema, saleReturnSchema, saleSchema } from "@/lib/validation";
import { applyStockChange, consumeBatches, restoreBatches, type Actor } from "./inventory";
import { getOpenSession } from "./cash";

export type SaleInput = z.infer<typeof saleSchema>;
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;
type ListQuery = z.infer<typeof listQuerySchema>;

export interface SalesActor extends Actor {
  role: Role;
}

export const saleInclude = {
  items: { include: { product: { select: { id: true, name: true, unit: true, barcode: true } } } },
  customer: { select: { id: true, name: true, phone: true } },
  returns: { include: { items: true } },
  invoice: { select: { id: true, status: true, uuid: true, kind: true } },
} satisfies Prisma.SaleInclude;

const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Precio que aplica según la cantidad (mayoreo si alcanza el mínimo). */
export function resolveUnitPrice(
  product: { price: Decimal; wholesalePrice: Decimal | null; wholesaleMinQty: Decimal | null },
  quantity: Decimal
) {
  if (product.wholesalePrice && product.wholesaleMinQty && quantity.gte(product.wholesaleMinQty)) {
    return D(product.wholesalePrice);
  }
  return D(product.price);
}

export async function createSale(actor: SalesActor, input: SaleInput) {
  if (input.clientRequestId) {
    const existing = await prisma.sale.findUnique({
      where: { businessId_clientRequestId: { businessId: actor.businessId, clientRequestId: input.clientRequestId } },
      include: saleInclude,
    });
    if (existing) return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: actor.businessId, archivedAt: null },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const lines = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(404, "Uno de los productos no existe o está archivado");
        const quantity = qty(item.quantity);
        if (product.unit === "PIECE" && !quantity.isInteger()) {
          throw new AppError(400, `${product.name} se vende por pieza; usa cantidades enteras`);
        }
        const computed = resolveUnitPrice(product, quantity);
        // Solo el dueño puede cambiar el precio de lista al vender.
        const unitPrice = item.unitPrice != null && actor.role === "OWNER" ? money(item.unitPrice) : computed;
        const gross = money(quantity.times(unitPrice));
        const discount = money(Math.min(item.discount ?? 0, gross.toNumber()));
        return { product, quantity, unitPrice, discount, subtotal: gross.minus(discount) };
      });

      const subtotal = sum(lines.map((l) => l.subtotal));
      const discount = money(Math.min(input.discount ?? 0, subtotal.toNumber()));
      const total = subtotal.minus(discount);

      let customer = null;
      if (input.customerId) {
        customer = await tx.customer.findFirst({
          where: { id: input.customerId, businessId: actor.businessId, archivedAt: null },
        });
        if (!customer) throw notFound("Cliente");
      }

      if (input.paymentMethod === "CREDIT") {
        if (!customer) throw new AppError(400, "Selecciona el cliente para vender fiado");
        const limit = D(customer.creditLimit);
        if (limit.gt(0) && D(customer.balance).plus(total).gt(limit)) {
          throw new AppError(
            409,
            `La venta excede el límite de crédito de ${customer.name} (saldo ${customer.balance.toFixed(2)} de ${limit.toFixed(2)})`
          );
        }
      }

      let amountReceived: Decimal | null = null;
      let change: Decimal | null = null;
      if (input.paymentMethod === "CASH" && input.amountReceived != null) {
        amountReceived = money(input.amountReceived);
        if (amountReceived.lt(total)) throw new AppError(400, "El monto recibido es menor al total");
        change = amountReceived.minus(total);
      }

      // La fecha del dispositivo solo se respeta en ventas hechas sin conexión (con clientRequestId).
      const offlineDate = input.clientRequestId ? input.createdAt : null;
      const createdAt =
        offlineDate && offlineDate.getTime() <= Date.now() && Date.now() - offlineDate.getTime() < OFFLINE_MAX_AGE_MS
          ? offlineDate
          : new Date();

      const cashSession = await getOpenSession(tx, actor.businessId);
      const { saleCounter } = await tx.business.update({
        where: { id: actor.businessId },
        data: { saleCounter: { increment: 1 } },
        select: { saleCounter: true },
      });

      const saleId = crypto.randomUUID();
      // Orden estable por producto para evitar bloqueos cruzados entre ventas simultáneas.
      const ordered = [...lines].sort((a, b) => a.product.id.localeCompare(b.product.id));
      const itemCosts = new Map<(typeof lines)[number], Decimal>();
      for (const line of ordered) {
        const updated = await applyStockChange(tx, actor, {
          productId: line.product.id,
          delta: line.quantity.neg(),
          type: "SALE",
          requireAvailable: true,
          referenceId: saleId,
        });
        itemCosts.set(line, D(updated.cost));
        if (line.product.trackExpiry) await consumeBatches(tx, line.product.id, line.quantity);
      }

      const costTotal = money(sum(lines.map((l) => l.quantity.times(itemCosts.get(l)!))));

      const sale = await tx.sale.create({
        data: {
          id: saleId,
          folio: saleCounter,
          clientRequestId: input.clientRequestId ?? null,
          paymentMethod: input.paymentMethod,
          subtotal,
          discount,
          total,
          costTotal,
          amountReceived,
          change,
          notes: input.notes,
          customerId: customer?.id ?? null,
          cashSessionId: cashSession?.id ?? null,
          userId: actor.userId,
          businessId: actor.businessId,
          createdAt,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              subtotal: l.subtotal,
              unitCost: itemCosts.get(l)!,
              taxRate: l.product.taxRate,
              iepsRate: l.product.iepsRate,
            })),
          },
        },
        include: saleInclude,
      });

      if (input.paymentMethod === "CREDIT" && customer) {
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: total } } });
      }

      await audit(tx, actor, "sale.create", "Sale", sale.id, {
        folio: sale.folio,
        total: total.toNumber(),
        paymentMethod: input.paymentMethod,
        discount: discount.toNumber(),
      });
      return sale;
    });
  } catch (err) {
    // Otra petición con el mismo clientRequestId ganó la carrera: devolver esa venta.
    if (
      input.clientRequestId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.sale.findUnique({
        where: { businessId_clientRequestId: { businessId: actor.businessId, clientRequestId: input.clientRequestId } },
        include: saleInclude,
      });
      if (existing) return existing;
    }
    throw err;
  }
}

export async function getSale(businessId: string, id: string) {
  const sale = await prisma.sale.findFirst({ where: { id, businessId }, include: saleInclude });
  if (!sale) throw notFound("Venta");
  return sale;
}

export async function listSales(businessId: string, timeZone: string, query: ListQuery) {
  const where: Prisma.SaleWhereInput = { businessId };
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    const range = dayRange(query.from ?? "2000-01-01", query.to ?? "2999-12-31", timeZone);
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.search) {
    const folio = Number(query.search.replace(/^#/, ""));
    where.OR = [
      { notes: { contains: query.search, mode: "insensitive" } },
      { customer: { name: { contains: query.search, mode: "insensitive" } } },
      { items: { some: { product: { name: { contains: query.search, mode: "insensitive" } } } } },
      ...(Number.isInteger(folio) && folio > 0 ? [{ folio }] : []),
    ];
  }

  const rows = await prisma.sale.findMany({
    where,
    include: saleInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Cancela una venta: regresa al inventario lo no devuelto y ajusta el saldo del cliente. */
export async function cancelSale(actor: Actor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id, businessId: actor.businessId },
      include: { items: { include: { product: true } }, returns: true, invoice: true },
    });
    if (!sale) throw notFound("Venta");
    if (sale.status === "CANCELLED") throw new AppError(409, "La venta ya está cancelada");
    if (sale.invoice && sale.invoice.status === "STAMPED" && sale.invoice.kind === "INDIVIDUAL") {
      throw new AppError(409, "La venta está facturada. Cancela primero la factura.");
    }

    const { count } = await tx.sale.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    if (count === 0) throw new AppError(409, "La venta ya está cancelada");

    for (const item of [...sale.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const pending = D(item.quantity).minus(item.returnedQuantity);
      if (pending.lte(0)) continue;
      await applyStockChange(tx, actor, {
        productId: item.productId,
        delta: pending,
        type: "SALE_CANCEL",
        unitCost: item.unitCost,
        referenceId: sale.id,
        notes: reason,
      });
      if (item.product.trackExpiry) await restoreBatches(tx, item.productId, pending);
    }

    if (sale.paymentMethod === "CREDIT" && sale.customerId) {
      const returnedToCredit = sum(sale.returns.filter((r) => r.refundMethod === "CREDIT").map((r) => r.total));
      const owed = D(sale.total).minus(returnedToCredit);
      if (owed.gt(0)) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: owed } } });
      }
    }

    // Si la venta en efectivo pertenece a otro turno, el reembolso sale de la caja actual.
    if (sale.paymentMethod === "CASH") {
      const open = await getOpenSession(tx, actor.businessId);
      if (open && open.id !== sale.cashSessionId) {
        const refunded = sum(sale.returns.filter((r) => r.refundMethod === "CASH").map((r) => r.total));
        const amount = D(sale.total).minus(refunded);
        if (amount.gt(0)) {
          await tx.cashMovement.create({
            data: {
              type: "OUT",
              amount,
              reason: `Cancelación de venta #${sale.folio}`,
              cashSessionId: open.id,
              businessId: actor.businessId,
              userId: actor.userId,
            },
          });
        }
      }
    }

    await audit(tx, actor, "sale.cancel", "Sale", sale.id, { folio: sale.folio, reason });
    return tx.sale.findUniqueOrThrow({ where: { id }, include: saleInclude });
  });
}

/**
 * Devolución parcial. El monto se prorratea con el descuento general de la venta
 * y el costo se toma del costo registrado al vender.
 */
export async function returnSale(actor: Actor, id: string, input: SaleReturnInput) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id, businessId: actor.businessId },
      include: { items: { include: { product: true } } },
    });
    if (!sale) throw notFound("Venta");
    if (sale.status === "CANCELLED") throw new AppError(409, "La venta está cancelada");

    if (input.refundMethod === "CREDIT" && sale.paymentMethod !== "CREDIT") {
      throw new AppError(400, "Solo las ventas fiadas pueden abonarse a la cuenta del cliente");
    }
    if (sale.paymentMethod === "CREDIT" && input.refundMethod !== "CREDIT") {
      throw new AppError(400, "Las ventas fiadas se devuelven descontando del saldo del cliente");
    }

    const factor = D(sale.subtotal).gt(0) ? D(sale.total).div(sale.subtotal) : D(0);
    const cashSession = await getOpenSession(tx, actor.businessId);
    const returnId = crypto.randomUUID();

    const lines = input.items.map((r) => {
      const item = sale.items.find((i) => i.id === r.saleItemId);
      if (!item) throw notFound("Producto de la venta");
      const quantity = qty(r.quantity);
      const available = D(item.quantity).minus(item.returnedQuantity);
      if (quantity.gt(available)) {
        throw new AppError(400, `Solo puedes devolver ${available.toString()} de ${item.product.name}`);
      }
      if (item.product.unit === "PIECE" && !quantity.isInteger()) {
        throw new AppError(400, `${item.product.name} se devuelve por pieza`);
      }
      const amount = money(D(item.subtotal).div(item.quantity).times(quantity).times(factor));
      const cost = money(D(item.unitCost).times(quantity));
      return { item, quantity, amount, cost };
    });

    const total = sum(lines.map((l) => l.amount));
    const costTotal = sum(lines.map((l) => l.cost));

    for (const line of lines) {
      const { count } = await tx.saleItem.updateMany({
        where: {
          id: line.item.id,
          returnedQuantity: { lte: D(line.item.quantity).minus(line.quantity) },
        },
        data: { returnedQuantity: { increment: line.quantity } },
      });
      if (count === 0) throw new AppError(409, "La devolución excede lo vendido");
      await applyStockChange(tx, actor, {
        productId: line.item.productId,
        delta: line.quantity,
        type: "SALE_RETURN",
        unitCost: line.item.unitCost,
        referenceId: returnId,
        notes: input.reason,
      });
      if (line.item.product.trackExpiry) await restoreBatches(tx, line.item.productId, line.quantity);
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        id: returnId,
        reason: input.reason,
        total,
        costTotal,
        refundMethod: input.refundMethod,
        saleId: sale.id,
        cashSessionId: input.refundMethod === "CASH" ? (cashSession?.id ?? null) : null,
        userId: actor.userId,
        businessId: actor.businessId,
        items: {
          create: lines.map((l) => ({
            quantity: l.quantity,
            amount: l.amount,
            cost: l.cost,
            saleItemId: l.item.id,
            productId: l.item.productId,
          })),
        },
      },
      include: { items: true },
    });

    if (input.refundMethod === "CREDIT" && sale.customerId) {
      await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: total } } });
    }

    await audit(tx, actor, "sale.return", "Sale", sale.id, { folio: sale.folio, total: total.toNumber() });
    return saleReturn;
  });
}

/** Texto del ticket para compartir por WhatsApp. */
export function receiptText(
  sale: Awaited<ReturnType<typeof getSale>>,
  business: { name: string; currency: string; locale: string; timezone: string; phone?: string | null; address?: string | null }
) {
  const fmt = (n: Decimal | number) =>
    new Intl.NumberFormat(business.locale, { style: "currency", currency: business.currency }).format(Number(n));
  const date = new Intl.DateTimeFormat(business.locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: business.timezone,
  }).format(sale.createdAt);
  const lines = [
    `*${business.name}*`,
    business.address,
    business.phone ? `Tel. ${business.phone}` : null,
    `Ticket #${sale.folio} · ${date}`,
    "",
    ...sale.items.map((i) => `${i.quantity.toString()} x ${i.product.name}  ${fmt(i.subtotal)}`),
    "",
    D(sale.discount).gt(0) ? `Descuento: -${fmt(sale.discount)}` : null,
    `*Total: ${fmt(sale.total)}*`,
    sale.status === "CANCELLED" ? "VENTA CANCELADA" : null,
    "",
    "¡Gracias por su compra!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
