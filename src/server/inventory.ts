import type { AdjustmentReason, StockMovementType } from "@/generated/prisma/enums";
import { AppError, notFound } from "@/lib/errors";
import { D, qty, weightedAverageCost, type Decimal, type DecimalLike } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export interface Actor {
  userId: string;
  businessId: string;
}

interface StockChange {
  productId: string;
  /** Cantidad con signo: positiva entra, negativa sale. */
  delta: DecimalLike;
  type: StockMovementType;
  /** Si es true y el cambio es negativo, falla cuando no hay existencias suficientes. */
  requireAvailable?: boolean;
  unitCost?: DecimalLike | null;
  reason?: AdjustmentReason | null;
  notes?: string | null;
  referenceId?: string | null;
}

/**
 * Aplica un movimiento de inventario de forma atómica y lo registra en el kardex.
 * Las salidas usan una actualización condicional (`stock >= cantidad`) para que dos
 * ventas simultáneas no puedan vender la misma existencia.
 */
export async function applyStockChange(tx: Tx, actor: Actor, change: StockChange) {
  const delta = qty(change.delta);
  let product;

  if (delta.lt(0) && change.requireAvailable) {
    const needed = delta.abs();
    const { count } = await tx.product.updateMany({
      where: { id: change.productId, businessId: actor.businessId, stock: { gte: needed } },
      data: { stock: { decrement: needed } },
    });
    if (count === 0) {
      const existing = await tx.product.findFirst({
        where: { id: change.productId, businessId: actor.businessId },
        select: { name: true, stock: true },
      });
      if (!existing) throw notFound("Producto");
      throw new AppError(409, `Stock insuficiente para ${existing.name} (disponible: ${existing.stock.toString()})`);
    }
    product = await tx.product.findUniqueOrThrow({ where: { id: change.productId } });
  } else {
    const { count } = await tx.product.updateMany({
      where: { id: change.productId, businessId: actor.businessId },
      data: { stock: { increment: delta } },
    });
    if (count === 0) throw notFound("Producto");
    product = await tx.product.findUniqueOrThrow({ where: { id: change.productId } });
  }

  await tx.stockMovement.create({
    data: {
      type: change.type,
      quantity: delta,
      stockAfter: product.stock,
      unitCost: change.unitCost != null ? D(change.unitCost) : product.cost,
      reason: change.reason ?? null,
      notes: change.notes ?? null,
      referenceId: change.referenceId ?? null,
      userId: actor.userId,
      productId: product.id,
      businessId: actor.businessId,
    },
  });

  return product;
}

/**
 * Registra una entrada de mercancía recalculando el costo promedio ponderado.
 * Bloquea la fila del producto para que el promedio se calcule sobre datos vigentes.
 */
export async function receiveStock(
  tx: Tx,
  actor: Actor,
  input: { productId: string; quantity: DecimalLike; unitCost: DecimalLike; referenceId?: string; type?: StockMovementType }
) {
  const rows = await tx.$queryRaw<{ stock: Decimal; cost: Decimal }[]>`
    SELECT "stock", "cost" FROM "Product"
    WHERE "id" = ${input.productId} AND "businessId" = ${actor.businessId}
    FOR UPDATE`;
  const current = rows[0];
  if (!current) throw notFound("Producto");

  const newCost = weightedAverageCost(current.stock, current.cost, input.quantity, input.unitCost);
  await tx.product.update({ where: { id: input.productId }, data: { cost: newCost } });

  return applyStockChange(tx, actor, {
    productId: input.productId,
    delta: input.quantity,
    type: input.type ?? "PURCHASE",
    unitCost: input.unitCost,
    referenceId: input.referenceId,
  });
}

/** Descuenta de los lotes con caducidad más próxima (FEFO). */
export async function consumeBatches(tx: Tx, productId: string, quantity: DecimalLike) {
  let remaining = D(quantity);
  const batches = await tx.productBatch.findMany({
    where: { productId, remaining: { gt: 0 } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  for (const batch of batches) {
    if (remaining.lte(0)) break;
    const take = minDecimal(batch.remaining, remaining);
    await tx.productBatch.update({ where: { id: batch.id }, data: { remaining: { decrement: take } } });
    remaining = remaining.minus(take);
  }
}

/** Regresa existencias a los lotes (devoluciones y cancelaciones), empezando por el que caduca antes. */
export async function restoreBatches(tx: Tx, productId: string, quantity: DecimalLike) {
  let remaining = D(quantity);
  const batches = await tx.productBatch.findMany({
    where: { productId },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  for (const batch of batches) {
    if (remaining.lte(0)) break;
    const room = D(batch.quantity).minus(batch.remaining);
    if (room.lte(0)) continue;
    const put = minDecimal(room, remaining);
    await tx.productBatch.update({ where: { id: batch.id }, data: { remaining: { increment: put } } });
    remaining = remaining.minus(put);
  }
}

function minDecimal(a: DecimalLike, b: DecimalLike) {
  return D(a).lt(D(b)) ? D(a) : D(b);
}

/** Ajuste manual de inventario (conteo físico, merma, caducidad, robo...). */
export async function adjustStock(
  actor: Actor,
  productId: string,
  input: { mode: "set" | "delta"; quantity: number; reason: AdjustmentReason; notes: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ stock: Decimal; trackExpiry: boolean }[]>`
      SELECT "stock", "trackExpiry" FROM "Product"
      WHERE "id" = ${productId} AND "businessId" = ${actor.businessId}
      FOR UPDATE`;
    const current = rows[0];
    if (!current) throw notFound("Producto");

    const delta = input.mode === "set" ? qty(input.quantity).minus(current.stock) : qty(input.quantity);
    if (delta.isZero()) throw new AppError(400, "El ajuste no cambia la existencia");
    if (input.mode === "set" && D(input.quantity).lt(0)) {
      throw new AppError(400, "La existencia no puede ser negativa");
    }

    const product = await applyStockChange(tx, actor, {
      productId,
      delta,
      type: "ADJUSTMENT",
      requireAvailable: true,
      reason: input.reason,
      notes: input.notes,
    });

    if (current.trackExpiry) {
      if (delta.lt(0)) await consumeBatches(tx, productId, delta.abs());
      else await restoreBatches(tx, productId, delta);
    }

    await audit(tx, actor, "stock.adjust", "Product", productId, {
      delta: delta.toNumber(),
      reason: input.reason,
      notes: input.notes,
    });
    return product;
  });
}

/**
 * Sugerencias de reabastecimiento: productos bajo el mínimo o con menos de
 * `coverDays` días de cobertura según la venta promedio de los últimos 30 días.
 */
export async function reorderSuggestions(businessId: string, coverDays = 14) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, archivedAt: null },
      include: { category: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { businessId, status: "ACTIVE", createdAt: { gte: since } } },
      _sum: { quantity: true, returnedQuantity: true },
    }),
  ]);

  const soldMap = new Map(
    sold.map((s) => [s.productId, D(s._sum.quantity).minus(D(s._sum.returnedQuantity))])
  );

  const lastPurchases = await prisma.purchaseItem.findMany({
    where: { purchase: { businessId, status: "ACTIVE" }, productId: { in: products.map((p) => p.id) } },
    orderBy: { purchase: { createdAt: "desc" } },
    distinct: ["productId"],
    include: { purchase: { select: { supplierName: true, supplier: { select: { id: true, name: true } } } } },
  });
  const lastSupplier = new Map(
    lastPurchases.map((i) => [
      i.productId,
      { supplier: i.purchase.supplier?.name ?? i.purchase.supplierName, lastCost: i.unitCost },
    ])
  );

  return products
    .map((p) => {
      const avgDaily = (soldMap.get(p.id) ?? D(0)).div(30);
      const daysOfCover = avgDaily.gt(0) ? D(p.stock).div(avgDaily).toDecimalPlaces(1) : null;
      const target = maxDecimal(D(p.minStock).times(2), avgDaily.times(coverDays));
      let suggested = target.minus(p.stock);
      suggested = p.unit === "PIECE" ? suggested.ceil() : suggested.toDecimalPlaces(3);
      const low = D(p.stock).lte(p.minStock);
      const needs = low || (daysOfCover !== null && daysOfCover.lt(coverDays / 2));
      return {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        category: p.category?.name ?? null,
        stock: p.stock,
        minStock: p.minStock,
        avgDailySales: avgDaily.toDecimalPlaces(3),
        daysOfCover,
        suggestedQuantity: suggested.gt(0) ? suggested : D(0),
        lastSupplier: lastSupplier.get(p.id)?.supplier ?? null,
        lastCost: lastSupplier.get(p.id)?.lastCost ?? p.cost,
        low,
        needs,
      };
    })
    .filter((s) => s.needs && s.suggestedQuantity.gt(0))
    .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
}

function maxDecimal(a: DecimalLike, b: DecimalLike) {
  return D(a).gt(D(b)) ? D(a) : D(b);
}
