import type { z } from "zod";
import { AppError, notFound } from "@/lib/errors";
import { D, qty } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { transferSchema } from "@/lib/validation";
import { applyStockChange, consumeBatches, receiveStock, restoreBatches, type Actor } from "./inventory";

export type TransferInput = z.infer<typeof transferSchema>;

export const transferInclude = {
  lines: true,
  fromBusiness: { select: { id: true, name: true } },
  toBusiness: { select: { id: true, name: true } },
} as const;

export async function listTransfers(businessId: string) {
  return prisma.stockTransfer.findMany({
    where: { OR: [{ fromBusinessId: businessId }, { toBusinessId: businessId }] },
    include: transferInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Sucursales a las que el usuario puede enviar mercancía (donde también es dueño). */
export async function transferDestinations(userId: string, businessId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, role: "OWNER", businessId: { not: businessId } },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { business: { name: "asc" } },
  });
  return memberships.map((m) => m.business);
}

/** Envía mercancía: sale del inventario de origen de inmediato y queda en tránsito. */
export async function createTransfer(actor: Actor, input: TransferInput) {
  if (input.toBusinessId === actor.businessId) throw new AppError(400, "Elige otra sucursal como destino");
  const destination = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: actor.userId, businessId: input.toBusinessId } },
  });
  if (!destination || destination.role !== "OWNER")
    throw new AppError(403, "Solo puedes enviar a sucursales donde eres dueño");

  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    if (ids.length !== input.lines.length) throw new AppError(400, "Hay productos repetidos en el traspaso");
    const products = await tx.product.findMany({
      where: { id: { in: ids }, businessId: actor.businessId, archivedAt: null },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const transfer = await tx.stockTransfer.create({
      data: {
        fromBusinessId: actor.businessId,
        toBusinessId: input.toBusinessId,
        notes: input.notes,
        createdById: actor.userId,
      },
    });

    for (const line of [...input.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
      const product = byId.get(line.productId);
      if (!product) throw notFound("Producto");
      const quantity = qty(line.quantity);
      if (product.unit === "PIECE" && !quantity.isInteger())
        throw new AppError(400, `${product.name} se envía por pieza`);
      await applyStockChange(tx, actor, {
        productId: product.id,
        delta: quantity.neg(),
        type: "TRANSFER_OUT",
        requireAvailable: true,
        referenceId: transfer.id,
      });
      if (product.trackExpiry) await consumeBatches(tx, product.id, quantity);
      await tx.stockTransferLine.create({
        data: {
          transferId: transfer.id,
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          sku: product.sku,
          unit: product.unit,
          quantity,
          unitCost: product.cost,
          price: product.price,
          taxRate: product.taxRate,
        },
      });
    }
    await audit(tx, actor, "transfer.send", "StockTransfer", transfer.id, {
      to: input.toBusinessId,
      lines: input.lines.length,
    });
    return tx.stockTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
  });
}

/** Producto equivalente en el destino: por código de barras, SKU o nombre; si no existe se crea. */
async function matchOrCreateProduct(
  tx: Tx,
  businessId: string,
  line: { name: string; barcode: string | null; sku: string | null; unit: string; price: unknown; taxRate: unknown }
) {
  const candidates = [
    line.barcode ? { barcode: line.barcode } : null,
    line.sku ? { sku: line.sku } : null,
    { name: { equals: line.name, mode: "insensitive" as const } },
  ].filter((c) => c !== null);
  for (const where of candidates) {
    const found = await tx.product.findFirst({ where: { businessId, archivedAt: null, ...where } });
    if (found) return found;
  }
  return tx.product.create({
    data: {
      businessId,
      name: line.name,
      barcode: line.barcode,
      sku: line.sku,
      unit: line.unit as never,
      price: D(line.price as never),
      taxRate: D(line.taxRate as never),
      cost: 0,
      stock: 0,
      minStock: 0,
    },
  });
}

/** La sucursal de destino confirma que llegó la mercancía. */
export async function receiveTransfer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, toBusinessId: actor.businessId, status: "IN_TRANSIT" },
      data: { status: "RECEIVED", receivedById: actor.userId, receivedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, "El traspaso no está en tránsito hacia esta sucursal");
    const lines = await tx.stockTransferLine.findMany({ where: { transferId: id }, orderBy: { name: "asc" } });
    for (const line of lines) {
      const product = await matchOrCreateProduct(tx, actor.businessId, line);
      await receiveStock(tx, actor, {
        productId: product.id,
        quantity: line.quantity,
        unitCost: line.unitCost,
        type: "TRANSFER_IN",
        referenceId: id,
      });
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { destProductId: product.id } });
    }
    await audit(tx, actor, "transfer.receive", "StockTransfer", id, { lines: lines.length });
    return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
  });
}

/** El origen cancela un traspaso en tránsito: la mercancía regresa a su inventario. */
export async function cancelTransfer(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, fromBusinessId: actor.businessId, status: "IN_TRANSIT" },
      data: { status: "CANCELLED" },
    });
    if (count === 0)
      throw new AppError(409, "Solo se pueden cancelar traspasos en tránsito enviados desde esta sucursal");
    const lines = await tx.stockTransferLine.findMany({ where: { transferId: id }, orderBy: { productId: "asc" } });
    for (const line of lines) {
      const product = await applyStockChange(tx, actor, {
        productId: line.productId,
        delta: line.quantity,
        type: "TRANSFER_IN",
        unitCost: line.unitCost,
        notes: "Traspaso cancelado",
        referenceId: id,
      });
      if (product.trackExpiry) await restoreBatches(tx, line.productId, line.quantity);
    }
    await audit(tx, actor, "transfer.cancel", "StockTransfer", id, {});
    return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
  });
}
