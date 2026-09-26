import type { z } from "zod";
import type { Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, sum, unitCost } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { purchaseOrderReceiveSchema, purchaseOrderSchema } from "@/lib/validation";
import type { Actor } from "./inventory";
import { createPurchaseInTx } from "./purchases";

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderReceiveInput = z.infer<typeof purchaseOrderReceiveSchema>;

export const purchaseOrderInclude = {
  lines: { include: { product: { select: { id: true, name: true, unit: true, barcode: true, packSize: true } } } },
  supplier: { select: { id: true, name: true, phone: true, contact: true } },
  purchases: { select: { id: true, folio: true, total: true, createdAt: true } },
} satisfies Prisma.PurchaseOrderInclude;

const OPEN: PurchaseOrderStatus[] = ["DRAFT", "SENT", "PARTIAL"];

export async function listPurchaseOrders(businessId: string, scope: "open" | "closed") {
  return prisma.purchaseOrder.findMany({
    where: { businessId, status: scope === "open" ? { in: OPEN } : { in: ["RECEIVED", "CANCELLED"] } },
    include: purchaseOrderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Crea la orden en borrador con el costo actual de cada producto si no se indica otro. */
export async function createPurchaseOrder(actor: Actor, input: PurchaseOrderInput) {
  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    if (ids.length !== input.lines.length) throw new AppError(400, "Hay productos repetidos en la orden");
    const products = await tx.product.findMany({ where: { id: { in: ids }, businessId: actor.businessId } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let supplierName = input.supplierName ?? null;
    let supplierId = input.supplierId ?? null;
    if (supplierId) {
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, businessId: actor.businessId } });
      if (!supplier) throw notFound("Proveedor");
      supplierName = supplier.name;
    } else if (supplierName) {
      // Desde "Qué comprar" llega el nombre del último proveedor: se enlaza si está registrado.
      const supplier = await tx.supplier.findFirst({
        where: { businessId: actor.businessId, archivedAt: null, name: { equals: supplierName, mode: "insensitive" } },
      });
      if (supplier) supplierId = supplier.id;
    }

    const lines = input.lines.map((l) => {
      const product = byId.get(l.productId);
      if (!product) throw notFound("Producto");
      const quantity = qty(l.quantity);
      if (product.unit === "PIECE" && !quantity.isInteger()) {
        throw new AppError(400, `${product.name} se pide por pieza; usa cantidades enteras`);
      }
      return { productId: product.id, quantity, unitCost: l.unitCost != null ? unitCost(l.unitCost) : D(product.cost) };
    });
    const { purchaseOrderCounter } = await tx.business.update({
      where: { id: actor.businessId },
      data: { purchaseOrderCounter: { increment: 1 } },
      select: { purchaseOrderCounter: true },
    });
    const order = await tx.purchaseOrder.create({
      data: {
        folio: purchaseOrderCounter,
        supplierId,
        supplierName,
        notes: input.notes,
        expectedAt: input.expectedAt ?? null,
        total: money(sum(lines.map((l) => l.quantity.times(l.unitCost)))),
        userId: actor.userId,
        businessId: actor.businessId,
        lines: { create: lines },
      },
      include: purchaseOrderInclude,
    });
    await audit(tx, actor, "purchaseOrder.create", "PurchaseOrder", order.id, { folio: order.folio });
    return order;
  });
}

/** Marca la orden como enviada al proveedor (el texto para WhatsApp lo arma la pantalla). */
export async function markPurchaseOrderSent(actor: Actor, id: string) {
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id, businessId: actor.businessId, status: "DRAFT" },
    data: { status: "SENT", sentAt: new Date() },
  });
  if (count === 0) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, businessId: actor.businessId } });
    if (!order) throw notFound("Orden de compra");
    // Reenviar una orden ya enviada no cambia nada.
    if (order.status !== "SENT") throw new AppError(409, "La orden ya no está en borrador");
  }
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
}

/**
 * Recibe mercancía de la orden: registra una compra por lo que llegó (costo promedio, lotes)
 * y deja la orden parcial o recibida.
 */
export async function receivePurchaseOrder(actor: Actor, id: string, input: PurchaseOrderReceiveInput) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} AND "businessId" = ${actor.businessId} FOR UPDATE`;
    if (rows.length === 0) throw notFound("Orden de compra");
    const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (!OPEN.includes(order.status)) throw new AppError(409, "La orden ya está cerrada");

    const received = input.lines.filter((l) => l.quantity > 0);
    if (received.length === 0) throw new AppError(400, "Indica qué cantidad llegó");
    const items = received.map((r) => {
      const line = order.lines.find((l) => l.id === r.lineId);
      if (!line) throw notFound("Renglón de la orden");
      const pending = D(line.quantity).minus(line.receivedQuantity);
      if (qty(r.quantity).gt(pending)) {
        throw new AppError(400, `Llegó más de lo pendiente en la orden (${pending.toString()})`);
      }
      return { line, input: r };
    });

    const purchase = await createPurchaseInTx(
      tx,
      actor,
      {
        supplierId: order.supplierId,
        supplierName: order.supplierId ? null : order.supplierName,
        notes: [`Orden de compra #${order.folio}`, input.notes].filter(Boolean).join(" · "),
        paidFromCash: input.paidFromCash,
        items: items.map(({ line, input: r }) => ({
          productId: line.productId,
          quantity: r.quantity,
          unitCost: r.unitCost ?? D(line.unitCost).toNumber(),
          lotCode: r.lotCode ?? null,
          expiresAt: r.expiresAt ?? null,
        })),
      },
      order.id
    );

    for (const { line, input: r } of items) {
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQuantity: { increment: qty(r.quantity) } },
      });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: id } });
    const complete = lines.every((l) => D(l.receivedQuantity).gte(l.quantity));
    await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? "RECEIVED" : "PARTIAL" } });
    await audit(tx, actor, "purchaseOrder.receive", "PurchaseOrder", id, {
      folio: order.folio,
      purchase: purchase.folio,
    });
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  });
}

/** Cierra la orden: sin nada recibido queda cancelada; con recepciones parciales, cerrada con faltantes. */
export async function closePurchaseOrder(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id, businessId: actor.businessId } });
    if (!order) throw notFound("Orden de compra");
    if (!OPEN.includes(order.status)) throw new AppError(409, "La orden ya está cerrada");
    const status = order.status === "PARTIAL" ? "RECEIVED" : "CANCELLED";
    const { count } = await tx.purchaseOrder.updateMany({ where: { id, status: order.status }, data: { status } });
    if (count === 0) throw new AppError(409, "La orden cambió; actualiza la página");
    await audit(tx, actor, "purchaseOrder.close", "PurchaseOrder", id, { folio: order.folio, status });
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  });
}
