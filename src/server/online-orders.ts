import type { z } from "zod";
import type { OnlineOrderStatus, Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, sum } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { onlineOrderSchema } from "@/lib/validation";
import type { Actor } from "./inventory";

export type OnlineOrderInput = z.infer<typeof onlineOrderSchema>;

export interface OnlineOrderItem {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  price: number;
}

const ACTIVE: OnlineOrderStatus[] = ["NEW", "ACCEPTED", "READY"];

/** Transiciones permitidas desde cada estado. */
const NEXT: Record<OnlineOrderStatus, OnlineOrderStatus[]> = {
  NEW: ["ACCEPTED", "READY", "CANCELLED"],
  ACCEPTED: ["READY", "DELIVERED", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Crea un pedido desde el catálogo público con los precios vigentes. */
export async function createOnlineOrder(slug: string, input: OnlineOrderInput) {
  const business = await prisma.business.findFirst({
    where: { catalogSlug: slug, catalogEnabled: true },
    select: { id: true },
  });
  if (!business) throw notFound("Catálogo");

  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, businessId: business.id, archivedAt: null },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items: OnlineOrderItem[] = [];
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (!product) throw new AppError(404, "Uno de los productos ya no está disponible");
      const quantity = qty(item.quantity);
      if (product.unit === "PIECE" && !quantity.isInteger())
        throw new AppError(400, `${product.name} se pide por pieza`);
      if (D(product.stock).lt(quantity)) throw new AppError(409, `No hay suficiente ${product.name}`);
      items.push({
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: quantity.toNumber(),
        price: D(product.price).toNumber(),
      });
    }
    const total = money(sum(items.map((i) => D(i.price).times(i.quantity))));
    const { orderCounter } = await tx.business.update({
      where: { id: business.id },
      data: { orderCounter: { increment: 1 } },
      select: { orderCounter: true },
    });
    return tx.onlineOrder.create({
      data: {
        number: orderCounter,
        customerName: input.customerName,
        phone: input.phone,
        notes: input.notes,
        fulfillment: input.fulfillment,
        address: input.fulfillment === "DELIVERY" ? input.address : null,
        items: items as unknown as Prisma.InputJsonValue,
        total,
        businessId: business.id,
      },
      select: { id: true, number: true, total: true },
    });
  });
}

export async function listOnlineOrders(businessId: string, scope: "active" | "delivered" | "cancelled") {
  const status = scope === "active" ? { in: ACTIVE } : scope === "delivered" ? "DELIVERED" : "CANCELLED";
  return prisma.onlineOrder.findMany({
    where: { businessId, status: status as Prisma.EnumOnlineOrderStatusFilter },
    include: { sale: { select: { id: true, folio: true, total: true } } },
    orderBy: scope === "active" ? { createdAt: "asc" } : { updatedAt: "desc" },
    take: 100,
  });
}

export async function onlineOrderCounts(businessId: string) {
  const rows = await prisma.onlineOrder.groupBy({
    by: ["status"],
    where: { businessId, status: { in: ACTIVE } },
    _count: true,
  });
  const count = (s: OnlineOrderStatus) => rows.find((r) => r.status === s)?._count ?? 0;
  return { new: count("NEW"), active: count("NEW") + count("ACCEPTED") + count("READY") };
}

export async function getOnlineOrder(businessId: string, id: string) {
  const order = await prisma.onlineOrder.findFirst({ where: { id, businessId } });
  if (!order) throw notFound("Pedido");
  return order;
}

export async function setOnlineOrderStatus(actor: Actor, id: string, status: OnlineOrderStatus) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.onlineOrder.findFirst({ where: { id, businessId: actor.businessId } });
    if (!order) throw notFound("Pedido");
    if (!NEXT[order.status].includes(status)) throw new AppError(409, "El pedido ya no puede cambiar a ese estado");
    const { count } = await tx.onlineOrder.updateMany({ where: { id, status: order.status }, data: { status } });
    if (count === 0) throw new AppError(409, "El pedido cambió; actualiza la página");
    await audit(tx, actor, `order.${status.toLowerCase()}`, "OnlineOrder", id, { number: order.number });
    return tx.onlineOrder.findUniqueOrThrow({ where: { id } });
  });
}

/** Marca el pedido como entregado y lo enlaza con la venta que lo cobró (dentro de la transacción de la venta). */
export async function closeOrderWithSale(tx: Tx, businessId: string, orderId: string, saleId: string) {
  const { count } = await tx.onlineOrder.updateMany({
    where: { id: orderId, businessId, status: { in: ACTIVE }, saleId: null },
    data: { status: "DELIVERED", saleId },
  });
  if (count === 0) throw new AppError(409, "El pedido ya fue cobrado o cancelado");
}
