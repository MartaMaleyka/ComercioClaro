import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { qty } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { openOrderSchema } from "@/lib/validation";
import type { Actor } from "./inventory";
import { productModifiers } from "./catalog";

export type OpenOrderInput = z.infer<typeof openOrderSchema>;
export type KitchenStatus = "PENDING" | "PREPARING" | "READY" | "SERVED";

export const openOrderInclude = {
  items: {
    include: { product: { select: { id: true, name: true, price: true, unit: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.OpenOrderInclude;

export async function listOpenOrders(businessId: string) {
  return prisma.openOrder.findMany({
    where: { businessId, status: "OPEN" },
    include: openOrderInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function getOpenOrder(businessId: string, id: string) {
  const order = await prisma.openOrder.findFirst({ where: { id, businessId }, include: openOrderInclude });
  if (!order) throw notFound("Cuenta");
  return order;
}

/**
 * Crea o actualiza una cuenta abierta. Los renglones con id se conservan (con su estado en cocina),
 * los nuevos se agregan y los que ya no vienen se quitan.
 */
export async function saveOpenOrder(actor: Actor, input: OpenOrderInput, id?: string) {
  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, businessId: actor.businessId, archivedAt: null },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (!product) throw new AppError(404, "Uno de los productos no existe o está archivado");
      if (product.unit === "PIECE" && !qty(item.quantity).isInteger()) {
        throw new AppError(400, `${product.name} se vende por pieza; usa cantidades enteras`);
      }
    }
    const modifiersFor = (item: OpenOrderInput["items"][number]) => {
      const available = productModifiers(byId.get(item.productId)!);
      const chosen = [...new Set(item.modifierIds ?? [])].map((modifierId) => {
        const modifier = available.find((m) => m.id === modifierId);
        if (!modifier) throw new AppError(400, "Uno de los extras ya no existe");
        return modifier;
      });
      return chosen.length > 0 ? (chosen as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    };

    let orderId = id;
    if (!orderId) {
      const { openOrderCounter } = await tx.business.update({
        where: { id: actor.businessId },
        data: { openOrderCounter: { increment: 1 } },
        select: { openOrderCounter: true },
      });
      const order = await tx.openOrder.create({
        data: {
          number: openOrderCounter,
          label: input.label,
          notes: input.notes,
          userId: actor.userId,
          businessId: actor.businessId,
        },
      });
      orderId = order.id;
    } else {
      const { count } = await tx.openOrder.updateMany({
        where: { id: orderId, businessId: actor.businessId, status: "OPEN" },
        data: { label: input.label, notes: input.notes },
      });
      if (count === 0) throw new AppError(409, "La cuenta ya se cobró o se canceló");
      const keep = input.items.map((i) => i.id).filter((x): x is string => Boolean(x));
      await tx.openOrderItem.deleteMany({ where: { orderId, id: { notIn: keep } } });
    }

    for (const item of input.items) {
      const product = byId.get(item.productId)!;
      if (item.id) {
        const { count } = await tx.openOrderItem.updateMany({
          where: { id: item.id, orderId },
          data: { quantity: qty(item.quantity), notes: item.notes, modifiers: modifiersFor(item) },
        });
        if (count === 0) throw notFound("Renglón de la cuenta");
      } else {
        await tx.openOrderItem.create({
          data: {
            orderId,
            productId: product.id,
            quantity: qty(item.quantity),
            notes: item.notes,
            modifiers: modifiersFor(item),
            sendToKitchen: product.sendToKitchen,
          },
        });
      }
    }
    await audit(tx, actor, id ? "openOrder.update" : "openOrder.create", "OpenOrder", orderId, { label: input.label });
    return tx.openOrder.findUniqueOrThrow({ where: { id: orderId }, include: openOrderInclude });
  });
}

export async function cancelOpenOrder(actor: Actor, id: string) {
  const { count } = await prisma.openOrder.updateMany({
    where: { id, businessId: actor.businessId, status: "OPEN" },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new AppError(409, "La cuenta ya se cobró o se canceló");
}

/** La venta cierra la cuenta (dentro de la transacción de la venta). */
export async function closeOpenOrderWithSale(tx: Tx, businessId: string, orderId: string, saleId: string) {
  const { count } = await tx.openOrder.updateMany({
    where: { id: orderId, businessId, status: "OPEN", saleId: null },
    data: { status: "CLOSED", saleId },
  });
  if (count === 0) throw new AppError(409, "La cuenta ya se cobró o se canceló");
}

/** Platillos pendientes en cocina: de cuentas abiertas o cobradas hace poco, que aún no se sirven. */
export async function kitchenQueue(businessId: string) {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  return prisma.openOrder.findMany({
    where: {
      businessId,
      status: { in: ["OPEN", "CLOSED"] },
      updatedAt: { gte: since },
      items: { some: { sendToKitchen: true, kitchenStatus: { not: "SERVED" } } },
    },
    include: {
      items: {
        where: { sendToKitchen: true, kitchenStatus: { not: "SERVED" } },
        include: { product: { select: { name: true, unit: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function setKitchenStatus(actor: Actor, itemId: string, status: KitchenStatus) {
  const item = await prisma.openOrderItem.findFirst({ where: { id: itemId, order: { businessId: actor.businessId } } });
  if (!item) throw notFound("Platillo");
  return prisma.openOrderItem.update({ where: { id: itemId }, data: { kitchenStatus: status } });
}
