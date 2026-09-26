import { AppError, notFound } from "@/lib/errors";
import { D, qty, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { applyStockChange, consumeBatches, restoreBatches, type Actor } from "./inventory";

/**
 * Conteo físico: se escanean los productos del anaquel y al aplicar el conteo la
 * existencia de cada producto contado queda igual a lo contado (ajuste por "Conteo físico").
 * Los productos no contados no se tocan.
 */

const lineInclude = {
  lines: {
    include: { product: { select: { id: true, name: true, unit: true, stock: true, barcode: true, cost: true } } },
    orderBy: { updatedAt: "desc" as const },
  },
};

export async function currentCount(businessId: string) {
  return prisma.inventoryCount.findFirst({ where: { businessId, status: "OPEN" }, include: lineInclude });
}

export async function startCount(actor: Actor, notes: string | null) {
  const open = await currentCount(actor.businessId);
  if (open) return open;
  return prisma.inventoryCount.create({
    data: { businessId: actor.businessId, userId: actor.userId, notes },
    include: lineInclude,
  });
}

export async function recordCount(
  actor: Actor,
  countId: string,
  input: { productId?: string | null; barcode?: string | null; quantity: number; mode: "add" | "set" }
) {
  const count = await prisma.inventoryCount.findFirst({ where: { id: countId, businessId: actor.businessId } });
  if (!count) throw notFound("Conteo");
  if (count.status !== "OPEN") throw new AppError(409, "El conteo ya está cerrado");

  const product = await prisma.product.findFirst({
    where: {
      businessId: actor.businessId,
      archivedAt: null,
      ...(input.productId ? { id: input.productId } : { OR: [{ barcode: input.barcode ?? "" }, { sku: input.barcode ?? "" }] }),
    },
  });
  if (!product) throw new AppError(404, input.barcode ? `No hay producto con el código ${input.barcode}` : "Producto no encontrado");
  if (!product.trackStock) throw new AppError(400, `${product.name} no lleva existencias`);
  const quantity = qty(input.quantity);
  if (product.unit === "PIECE" && !quantity.isInteger()) throw new AppError(400, `${product.name} se cuenta por pieza`);

  const existing = await prisma.inventoryCountLine.findUnique({
    where: { countId_productId: { countId, productId: product.id } },
  });
  const counted = input.mode === "add" ? D(existing?.counted ?? 0).plus(quantity) : quantity;
  if (counted.lt(0)) throw new AppError(400, "La cantidad contada no puede ser negativa");

  return prisma.inventoryCountLine.upsert({
    where: { countId_productId: { countId, productId: product.id } },
    create: { countId, productId: product.id, counted },
    update: { counted },
    include: { product: { select: { id: true, name: true, unit: true, stock: true } } },
  });
}

export async function removeCountLine(actor: Actor, countId: string, productId: string) {
  const count = await prisma.inventoryCount.findFirst({ where: { id: countId, businessId: actor.businessId, status: "OPEN" } });
  if (!count) throw notFound("Conteo");
  await prisma.inventoryCountLine.deleteMany({ where: { countId, productId } });
}

export async function applyCount(actor: Actor, countId: string) {
  return prisma.$transaction(async (tx) => {
    const { count: updated } = await tx.inventoryCount.updateMany({
      where: { id: countId, businessId: actor.businessId, status: "OPEN" },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
    if (updated === 0) throw new AppError(409, "El conteo no está abierto");

    const lines = await tx.inventoryCountLine.findMany({
      where: { countId },
      include: { product: true },
      orderBy: { productId: "asc" },
    });
    let adjusted = 0;
    for (const line of lines) {
      const rows = await tx.$queryRaw<{ stock: Decimal }[]>`
        SELECT "stock" FROM "Product" WHERE "id" = ${line.productId} FOR UPDATE`;
      const delta = qty(line.counted).minus(rows[0]?.stock ?? 0);
      if (delta.isZero()) continue;
      await applyStockChange(tx, actor, {
        productId: line.productId,
        delta,
        type: "ADJUSTMENT",
        reason: "COUNT",
        notes: "Conteo físico",
        referenceId: countId,
      });
      if (line.product.trackExpiry) {
        if (delta.lt(0)) await consumeBatches(tx, line.productId, delta.abs());
        else await restoreBatches(tx, line.productId, delta);
      }
      adjusted++;
    }
    await audit(tx, actor, "stock.count", "InventoryCount", countId, { lines: lines.length, adjusted });
    return { lines: lines.length, adjusted };
  });
}

export async function cancelCount(actor: Actor, countId: string) {
  const { count } = await prisma.inventoryCount.updateMany({
    where: { id: countId, businessId: actor.businessId, status: "OPEN" },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new AppError(409, "El conteo no está abierto");
}
