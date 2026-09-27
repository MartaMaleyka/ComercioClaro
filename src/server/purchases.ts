import crypto from "crypto";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, reverseWeightedAverageCost, sum, unitCost, type Decimal } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayRange } from "@/lib/dates";
import type { listQuerySchema, purchaseSchema } from "@/lib/validation";
import { applyStockChange, receiveStock, type Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { cancelBillForPurchase, createBillInTx } from "./payables";
import { assertOpenPeriod } from "./accounting";

type CreditFields = "onCredit" | "invoiceNumber" | "dueDate";
/** Los datos de crédito son opcionales: sin ellos la compra es de contado. */
export type PurchaseInput = Omit<z.infer<typeof purchaseSchema>, CreditFields> &
  Partial<Pick<z.infer<typeof purchaseSchema>, CreditFields>>;
type ListQuery = z.infer<typeof listQuerySchema>;

export const purchaseInclude = {
  items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  supplier: { select: { id: true, name: true } },
  bill: { select: { id: true, status: true, balance: true, dueDate: true, number: true } },
} satisfies Prisma.PurchaseInclude;

export async function createPurchase(actor: Actor, input: PurchaseInput) {
  return prisma.$transaction((tx) => createPurchaseInTx(tx, actor, input));
}

/** Registra la compra dentro de una transacción existente (también la usa la recepción de órdenes de compra). */
export async function createPurchaseInTx(tx: Tx, actor: Actor, input: PurchaseInput, purchaseOrderId?: string) {
  await assertOpenPeriod(tx, actor.businessId, new Date());
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, businessId: actor.businessId },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  let supplierName = input.supplierName;
  if (input.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, businessId: actor.businessId } });
    if (!supplier) throw notFound("Proveedor");
    supplierName = supplier.name;
  }

  const lines = input.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw notFound("Producto");
    const quantity = qty(item.quantity);
    if (product.unit === "PIECE" && !quantity.isInteger()) {
      throw new AppError(400, `${product.name} se compra por pieza; usa cantidades enteras`);
    }
    const cost = item.unitCost != null ? unitCost(item.unitCost) : D(product.cost);
    return { item, product, quantity, cost, subtotal: money(quantity.times(cost)) };
  });
  const total = sum(lines.map((l) => l.subtotal));
  // ITBMS/IVA incluido en el costo (crédito fiscal): el indicado en la factura o el de cada producto.
  const tax =
    input.tax != null
      ? money(input.tax)
      : money(sum(lines.map((l) => l.subtotal.times(l.product.taxRate).div(D(1).plus(l.product.taxRate)))));
  if (tax.gt(total)) throw new AppError(400, "El impuesto no puede ser mayor al total de la compra");
  if (input.onCredit && input.paidFromCash) {
    throw new AppError(400, "Una compra a crédito no se paga con dinero de la caja");
  }

  const cashSession = input.paidFromCash ? await getOpenSession(tx, actor.businessId) : null;
  if (input.paidFromCash && !cashSession) {
    throw new AppError(409, "No hay una caja abierta para pagar la compra en efectivo");
  }

  const { purchaseCounter } = await tx.business.update({
    where: { id: actor.businessId },
    data: { purchaseCounter: { increment: 1 } },
    select: { purchaseCounter: true },
  });

  const purchaseId = crypto.randomUUID();
  for (const line of [...lines].sort((a, b) => a.product.id.localeCompare(b.product.id))) {
    await receiveStock(tx, actor, {
      productId: line.product.id,
      quantity: line.quantity,
      unitCost: line.cost,
      referenceId: purchaseId,
    });
  }

  const purchase = await tx.purchase.create({
    data: {
      id: purchaseId,
      folio: purchaseCounter,
      total,
      supplierId: input.supplierId ?? null,
      supplierName,
      notes: input.notes,
      paidFromCash: input.paidFromCash,
      onCredit: input.onCredit,
      tax,
      purchaseOrderId: purchaseOrderId ?? null,
      cashSessionId: cashSession?.id ?? null,
      userId: actor.userId,
      businessId: actor.businessId,
      items: {
        create: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitCost: l.cost,
          subtotal: l.subtotal,
          lotCode: l.item.lotCode,
          expiresAt: l.item.expiresAt ?? null,
        })),
      },
    },
    include: { items: true },
  });

  // Lotes con caducidad para productos que la controlan o cuando se indicó fecha.
  for (const item of purchase.items) {
    const product = productMap.get(item.productId)!;
    if (product.trackExpiry || item.expiresAt) {
      await tx.productBatch.create({
        data: {
          lotCode: item.lotCode,
          expiresAt: item.expiresAt,
          quantity: item.quantity,
          remaining: item.quantity,
          productId: item.productId,
          purchaseItemId: item.id,
          businessId: actor.businessId,
        },
      });
    }
  }

  if (input.onCredit) {
    await createBillInTx(tx, actor, {
      supplierId: input.supplierId ?? null,
      supplierName,
      number: input.invoiceNumber ?? null,
      dueDate: input.dueDate ?? null,
      total: total.toNumber(),
      tax: tax.toNumber(),
      notes: input.notes,
      purchaseId: purchase.id,
    });
  }

  await audit(tx, actor, "purchase.create", "Purchase", purchase.id, {
    folio: purchase.folio,
    total: total.toNumber(),
    ...(input.onCredit ? { onCredit: true } : {}),
  });
  return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: purchaseInclude });
}

export async function listPurchases(businessId: string, timeZone: string, query: ListQuery) {
  const where: Prisma.PurchaseWhereInput = { businessId };
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    const range = dayRange(query.from ?? "2000-01-01", query.to ?? "2999-12-31", timeZone);
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.search) {
    where.OR = [
      { supplierName: { contains: query.search, mode: "insensitive" } },
      { notes: { contains: query.search, mode: "insensitive" } },
      { items: { some: { product: { name: { contains: query.search, mode: "insensitive" } } } } },
    ];
  }
  const rows = await prisma.purchase.findMany({
    where,
    include: purchaseInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/**
 * Cancela una compra. Falla si la mercancía ya se vendió (no hay existencia suficiente),
 * en lugar de dejar el inventario en negativo.
 */
export async function cancelPurchase(actor: Actor, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id, businessId: actor.businessId },
      include: { items: { include: { batches: true } } },
    });
    if (!purchase) throw notFound("Compra");
    await assertOpenPeriod(tx, actor.businessId, purchase.createdAt);

    const { count } = await tx.purchase.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    if (count === 0) throw new AppError(409, "La compra ya está cancelada");
    await cancelBillForPurchase(tx, actor, purchase.id);

    for (const item of [...purchase.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const rows = await tx.$queryRaw<{ stock: Decimal; cost: Decimal }[]>`
        SELECT "stock", "cost" FROM "Product" WHERE "id" = ${item.productId} FOR UPDATE`;
      const current = rows[0];
      if (current) {
        const newCost = reverseWeightedAverageCost(current.stock, current.cost, item.quantity, item.unitCost);
        await tx.product.update({ where: { id: item.productId }, data: { cost: newCost } });
      }
      await applyStockChange(tx, actor, {
        productId: item.productId,
        delta: D(item.quantity).neg(),
        type: "PURCHASE_CANCEL",
        requireAvailable: true,
        unitCost: item.unitCost,
        referenceId: purchase.id,
        notes: reason,
      });
      for (const batch of item.batches) {
        const take = D(batch.remaining).lt(item.quantity) ? D(batch.remaining) : D(item.quantity);
        if (take.gt(0)) {
          await tx.productBatch.update({ where: { id: batch.id }, data: { remaining: { decrement: take } } });
        }
      }
    }

    if (purchase.paidFromCash) {
      const open = await getOpenSession(tx, actor.businessId);
      if (open && open.id !== purchase.cashSessionId) {
        await tx.cashMovement.create({
          data: {
            type: "IN",
            amount: purchase.total,
            reason: `Cancelación de compra #${purchase.folio}`,
            source: "PURCHASE_CANCEL",
            cashSessionId: open.id,
            businessId: actor.businessId,
            userId: actor.userId,
          },
        });
      }
    }

    await audit(tx, actor, "purchase.cancel", "Purchase", purchase.id, { folio: purchase.folio, reason });
    return tx.purchase.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
  });
}
