import crypto from "crypto";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, sum, unitCost, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayRange } from "@/lib/dates";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import type { listQuerySchema, saleReturnSchema, saleSchema } from "@/lib/validation";
import { applyStockChange, consumeBatches, restoreBatches, type Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { assertChargeForSale } from "./yappy";
import { productModifiers } from "./catalog";
import { recipesFor, type RecipeLine } from "./recipes";
import { paidWith, resolvePayments, type PaymentInput } from "./payments";
import { assertOpenPeriod, isClosedPeriod } from "./accounting";
import { redeemCoupon } from "./campaigns";
import { closeOrderWithSale } from "./online-orders";
import { closeOpenOrderWithSale } from "./open-orders";
import { maskCode, redeemGiftCard, refundGiftCard } from "./gift-cards";
import { creditDueDate } from "@/lib/credit-terms";
import { featureLabel, type FeatureKey } from "@/lib/features";
import { bestPromotion, type PromotionRule } from "@/lib/promotions";
import type { Promotion } from "@/generated/prisma/client";

export function toPromotionRule(p: Promotion): PromotionRule {
  return {
    ...p,
    percent: p.percent?.toNumber() ?? null,
    bundlePrice: p.bundlePrice?.toNumber() ?? null,
  };
}

export type SaleInput = Omit<
  z.infer<typeof saleSchema>,
  | "paymentReference"
  | "yappyChargeId"
  | "onlineOrderId"
  | "openOrderId"
  | "giftCardCode"
  | "senior"
  | "seniorId"
  | "payments"
  | "couponCode"
> & {
  couponCode?: string | null;
  payments?: PaymentInput[] | null;
  senior?: boolean;
  seniorId?: string | null;
  paymentReference?: string | null;
  giftCardCode?: string | null;
  openOrderId?: string | null;
  yappyChargeId?: string | null;
  onlineOrderId?: string | null;
};
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;
type ListQuery = z.infer<typeof listQuerySchema>;

export interface SalesActor extends Actor {
  role: Role;
  /** Funciones del plan; sin indicar, todas (seed y pruebas) */
  features?: FeatureKey[];
}

export const saleInclude = {
  items: { include: { product: { select: { id: true, name: true, unit: true, barcode: true } } } },
  customer: { select: { id: true, name: true, phone: true } },
  returns: { include: { items: true } },
  payments: { orderBy: { amount: "desc" } },
  coupon: { select: { code: true } },
  invoice: { select: { id: true, status: true, uuid: true, kind: true, error: true, provider: true, qrUrl: true } },
} satisfies Prisma.SaleInclude;

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const canUse = (feature: FeatureKey) => !actor.features || actor.features.includes(feature);
  const usesGiftCard =
    input.paymentMethod === "GIFT_CARD" || Boolean(input.payments?.some((p) => p.method === "GIFT_CARD"));
  if (usesGiftCard && !canUse("giftCards")) {
    throw new AppError(403, `Tu plan no incluye ${featureLabel("giftCards")}.`);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: actor.businessId, archivedAt: null },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const [business, promotionRows] = await Promise.all([
        tx.business.findUniqueOrThrow({
          where: { id: actor.businessId },
          select: {
            loyaltyEnabled: true,
            loyaltyPointsPerUnit: true,
            loyaltyPointValue: true,
            seniorDiscountRate: true,
            offlineDays: true,
            timezone: true,
          },
        }),
        // Sin la función de promociones en el plan, no se aplican.
        canUse("promotions")
          ? tx.promotion.findMany({ where: { businessId: actor.businessId, active: true } })
          : Promise.resolve([]),
      ]);
      const loyaltyEnabled = business.loyaltyEnabled && canUse("loyalty");
      const promotions = promotionRows.map(toPromotionRule);

      let customer = null;
      if (input.customerId) {
        customer = await tx.customer.findFirst({
          where: { id: input.customerId, businessId: actor.businessId, archivedAt: null },
        });
        if (!customer) throw notFound("Cliente");
      }

      // Descuento de jubilado (Ley 6 de 1987): por el botón del punto de venta o por el cliente registrado.
      const senior = input.senior || Boolean(customer?.isSenior);
      const seniorRate = D(business.seniorDiscountRate);
      if (senior && seniorRate.lte(0)) {
        throw new AppError(400, "Configura el porcentaje de descuento de jubilado en Configuración");
      }

      const lines = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(404, "Uno de los productos no existe o está archivado");
        if (product.isIngredient) throw new AppError(400, `${product.name} es un insumo y no se vende en la caja`);
        const quantity = qty(item.quantity);
        if (product.unit === "PIECE" && !quantity.isInteger()) {
          throw new AppError(400, `${product.name} se vende por pieza; usa cantidades enteras`);
        }
        // Extras elegidos (p. ej. "Queso +0.50"): se validan contra los del producto y suman al precio.
        const available = productModifiers(product);
        const modifiers = [...new Set(item.modifierIds ?? [])].map((modifierId) => {
          const modifier = available.find((m) => m.id === modifierId);
          if (!modifier) throw new AppError(400, `Un extra de ${product.name} ya no existe; vuelve a agregarlo`);
          return modifier;
        });
        const computed = resolveUnitPrice(product, quantity).plus(sum(modifiers.map((m) => m.price)));
        // Solo el dueño puede cambiar el precio de lista al vender.
        const unitPrice = item.unitPrice != null && actor.role === "OWNER" ? money(item.unitPrice) : money(computed);
        const gross = money(quantity.times(unitPrice));
        // Promoción vigente con mayor descuento (2x1, 3 por B/.1, % por producto o categoría).
        const promo = bestPromotion(promotions, {
          productId: product.id,
          categoryId: product.categoryId,
          quantity: quantity.toNumber(),
          unitPrice: unitPrice.toNumber(),
        });
        let promotionDiscount = money(promo?.discount ?? 0);
        let promotionId = promo?.promotion.id ?? null;
        // El de jubilado no se suma a la promoción: se aplica el que más le conviene al cliente.
        let seniorDiscount = senior && product.seniorEligible ? money(gross.times(seniorRate)) : D(0);
        if (seniorDiscount.gt(promotionDiscount)) {
          promotionDiscount = D(0);
          promotionId = null;
        } else {
          seniorDiscount = D(0);
        }
        const discount = money(
          Math.min((item.discount ?? 0) + promotionDiscount.plus(seniorDiscount).toNumber(), gross.toNumber())
        );
        return {
          product,
          modifiers,
          quantity,
          unitPrice,
          discount,
          promotionDiscount,
          seniorDiscount,
          promotionId,
          subtotal: gross.minus(discount),
        };
      });

      const subtotal = sum(lines.map((l) => l.subtotal));
      const discount = money(Math.min(input.discount ?? 0, subtotal.toNumber()));
      let total = subtotal.minus(discount);

      // Cupón de una campaña: se descuenta después del descuento general.
      let coupon = null;
      let couponDiscount = D(0);
      if (input.couponCode) {
        if (!canUse("campaigns")) throw new AppError(403, `Tu plan no incluye ${featureLabel("campaigns")}.`);
        ({ coupon, discount: couponDiscount } = await redeemCoupon(tx, actor.businessId, input.couponCode, total));
        total = total.minus(couponDiscount);
      }
      const seniorDiscount = money(sum(lines.map((l) => l.seniorDiscount)));

      // Canje de puntos de lealtad como descuento.
      let pointsRedeemed = 0;
      let pointsDiscount = D(0);
      if (input.redeemPoints && input.redeemPoints > 0) {
        if (!loyaltyEnabled) throw new AppError(400, "El programa de puntos no está activo");
        if (!customer) throw new AppError(400, "Selecciona el cliente para canjear puntos");
        if (customer.points < input.redeemPoints)
          throw new AppError(400, `${customer.name} solo tiene ${customer.points} puntos`);
        const value = D(business.loyaltyPointValue);
        const maxPoints = value.gt(0) ? total.div(value).floor().toNumber() : 0;
        pointsRedeemed = Math.min(input.redeemPoints, maxPoints);
        pointsDiscount = money(value.times(pointsRedeemed));
        total = total.minus(pointsDiscount);
      }

      // Formas de pago: una sola o dividido. El cambio sale solo de la parte en efectivo.
      const { payments, method: paymentMethod, amountReceived, change } = resolvePayments(total, input);
      const creditAmount = paidWith(payments, "CREDIT");

      let dueDate: Date | null = null;
      if (creditAmount.gt(0)) {
        if (!customer) throw new AppError(400, "Selecciona el cliente para vender fiado");
        dueDate = creditDueDate(customer, new Date(), business.timezone);
        const limit = D(customer.creditLimit);
        if (limit.gt(0) && D(customer.balance).plus(creditAmount).gt(limit)) {
          throw new AppError(
            409,
            `La venta excede el límite de crédito de ${customer.name} (saldo ${customer.balance.toFixed(2)} de ${limit.toFixed(2)})`
          );
        }
      }

      // La fecha del dispositivo solo se respeta en ventas hechas sin conexión (con clientRequestId).
      const offlineDate = input.clientRequestId ? input.createdAt : null;
      let createdAt =
        offlineDate &&
        offlineDate.getTime() <= Date.now() &&
        Date.now() - offlineDate.getTime() < business.offlineDays * DAY_MS
          ? offlineDate
          : new Date();
      // Una venta sin conexión con fecha en un mes ya cerrado se registra con la fecha de hoy.
      if (createdAt !== offlineDate || !(await isClosedPeriod(tx, actor.businessId, createdAt))) {
        await assertOpenPeriod(tx, actor.businessId, createdAt);
      } else {
        createdAt = new Date();
        await assertOpenPeriod(tx, actor.businessId, createdAt);
      }

      // Cobro de Yappy confirmado por la pasarela: su número de operación queda como referencia.
      let yappyCharge = null;
      const yappyPart = payments.find((p) => p.method === "YAPPY" && p.yappyChargeId);
      if (yappyPart) {
        yappyCharge = await assertChargeForSale(tx, actor, yappyPart.yappyChargeId!, yappyPart.amount);
        yappyPart.reference = yappyCharge.providerTxId ?? yappyCharge.orderId;
      }

      const cashSession = await getOpenSession(tx, actor.businessId);
      const { saleCounter } = await tx.business.update({
        where: { id: actor.businessId },
        data: { saleCounter: { increment: 1 } },
        select: { saleCounter: true },
      });

      const saleId = crypto.randomUUID();
      // Pago con vale: se descuenta del saldo la parte que cubre.
      let giftCard = null;
      const giftPart = payments.find((p) => p.method === "GIFT_CARD");
      if (giftPart) {
        if (!giftPart.giftCardCode) throw new AppError(400, "Escribe o escanea el código del vale");
        giftCard = await redeemGiftCard(tx, actor, giftPart.giftCardCode, giftPart.amount, saleId);
        giftPart.reference = maskCode(giftCard.code);
      }
      // Platos con receta: se descuentan sus insumos en lugar del plato.
      const recipes = canUse("recipes")
        ? await recipesFor(tx, actor.businessId, productIds)
        : new Map<string, RecipeLine[]>();
      type Line = (typeof lines)[number];
      const changes: { productId: string; delta: Decimal; line: Line; ingredient: boolean }[] = [];
      const lineIngredients = new Map<Line, { ingredientId: string; quantity: Decimal; unitCost: Decimal }[]>();
      const itemCosts = new Map<Line, Decimal>();
      for (const line of lines) {
        const recipe = recipes.get(line.product.id);
        if (recipe?.length) {
          lineIngredients.set(line, []);
          for (const r of recipe) {
            const quantity = qty(r.perUnit.times(line.quantity));
            if (quantity.gt(0))
              changes.push({ productId: r.ingredientId, delta: quantity.neg(), line, ingredient: true });
          }
        } else if (line.product.trackStock) {
          changes.push({ productId: line.product.id, delta: line.quantity.neg(), line, ingredient: false });
        } else {
          // Servicios (entrega a domicilio y similares): no llevan existencias.
          itemCosts.set(line, D(line.product.cost));
        }
      }
      // Orden estable por producto para evitar bloqueos cruzados entre ventas simultáneas.
      changes.sort((a, b) => a.productId.localeCompare(b.productId));
      for (const change of changes) {
        const updated = await applyStockChange(tx, actor, {
          productId: change.productId,
          delta: change.delta,
          type: "SALE",
          // Los insumos pueden quedar en negativo: un conteo desactualizado no detiene la venta.
          requireAvailable: !change.ingredient,
          referenceId: saleId,
        });
        if (change.ingredient) {
          lineIngredients
            .get(change.line)!
            .push({ ingredientId: change.productId, quantity: change.delta.abs(), unitCost: D(updated.cost) });
        } else {
          itemCosts.set(change.line, D(updated.cost));
        }
        if (updated.trackExpiry) await consumeBatches(tx, change.productId, change.delta.abs());
      }
      // Costo del plato: la suma de sus insumos al costo vigente.
      for (const [line, used] of lineIngredients) {
        const cost = sum(used.map((u) => u.quantity.times(u.unitCost)));
        itemCosts.set(line, unitCost(cost.div(line.quantity)));
      }

      const costTotal = money(sum(lines.map((l) => l.quantity.times(itemCosts.get(l)!))));

      const sale = await tx.sale.create({
        data: {
          id: saleId,
          folio: saleCounter,
          clientRequestId: input.clientRequestId ?? null,
          paymentMethod,
          subtotal,
          discount,
          total,
          costTotal,
          amountReceived,
          change,
          pointsRedeemed,
          pointsDiscount,
          seniorDiscount,
          couponId: coupon?.id ?? null,
          couponDiscount,
          seniorId: senior ? (input.seniorId ?? customer?.seniorId ?? null) : null,
          giftCardId: giftCard?.id ?? null,
          // Referencia principal (búsqueda y conciliación): la primera que haya.
          paymentReference: payments.find((p) => p.reference)?.reference ?? null,
          payments: {
            create: payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              giftCardId: p.method === "GIFT_CARD" ? (giftCard?.id ?? null) : null,
              yappyChargeId: p.method === "YAPPY" ? (yappyCharge?.id ?? null) : null,
            })),
          },
          dueDate,
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
              promotionDiscount: l.promotionDiscount,
              seniorDiscount: l.seniorDiscount,
              promotionId: l.promotionId,
              ...(l.modifiers.length > 0 ? { modifiers: l.modifiers as unknown as Prisma.InputJsonValue } : {}),
              subtotal: l.subtotal,
              unitCost: itemCosts.get(l)!,
              taxRate: l.product.taxRate,
              iepsRate: l.product.iepsRate,
              ...(lineIngredients.get(l)?.length ? { ingredients: { create: lineIngredients.get(l) } } : {}),
            })),
          },
        },
        include: saleInclude,
      });

      if (yappyCharge) {
        await tx.yappyCharge.update({ where: { id: yappyCharge.id }, data: { saleId: sale.id } });
      }
      if (input.onlineOrderId) await closeOrderWithSale(tx, actor.businessId, input.onlineOrderId, sale.id);
      if (input.openOrderId) await closeOpenOrderWithSale(tx, actor.businessId, input.openOrderId, sale.id);

      // Puntos: se ganan sobre lo pagado (no en ventas fiadas) y se descuentan los canjeados.
      if (customer && loyaltyEnabled) {
        // Lo fiado no gana puntos hasta pagarse.
        const earned = total.minus(creditAmount).times(business.loyaltyPointsPerUnit).floor().toNumber();
        if (pointsRedeemed > 0) {
          const { count } = await tx.customer.updateMany({
            where: { id: customer.id, points: { gte: pointsRedeemed } },
            data: { points: { decrement: pointsRedeemed } },
          });
          if (count === 0) throw new AppError(409, "Los puntos del cliente cambiaron; intenta de nuevo");
        }
        if (earned > 0) {
          await tx.customer.update({ where: { id: customer.id }, data: { points: { increment: earned } } });
          await tx.sale.update({ where: { id: sale.id }, data: { pointsEarned: earned } });
          sale.pointsEarned = earned;
        }
      }

      if (creditAmount.gt(0) && customer) {
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: creditAmount } } });
      }

      await audit(tx, actor, "sale.create", "Sale", sale.id, {
        folio: sale.folio,
        total: total.toNumber(),
        paymentMethod,
        ...(paymentMethod === "MIXED"
          ? { payments: payments.map((p) => ({ method: p.method, amount: p.amount.toNumber() })) }
          : {}),
        discount: discount.toNumber(),
        ...(senior ? { seniorDiscount: seniorDiscount.toNumber() } : {}),
        ...(coupon ? { coupon: coupon.code, couponDiscount: couponDiscount.toNumber() } : {}),
      });
      return sale;
    });
  } catch (err) {
    // Otra petición con el mismo clientRequestId ganó la carrera: devolver esa venta.
    if (input.clientRequestId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
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
  // Una forma de pago incluye los pagos divididos que la usaron; "MIXED" muestra solo los divididos.
  if (query.paymentMethod === "MIXED") where.paymentMethod = "MIXED";
  else if (query.paymentMethod) where.payments = { some: { method: query.paymentMethod } };
  if (query.from || query.to) {
    const range = dayRange(query.from ?? "2000-01-01", query.to ?? "2999-12-31", timeZone);
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.search) {
    const folio = Number(query.search.replace(/^#/, ""));
    where.OR = [
      { notes: { contains: query.search, mode: "insensitive" } },
      { paymentReference: { contains: query.search, mode: "insensitive" } },
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
      include: {
        items: { include: { product: true, ingredients: true } },
        returns: true,
        invoice: true,
        payments: true,
      },
    });
    if (!sale) throw notFound("Venta");
    if (sale.status === "CANCELLED") throw new AppError(409, "La venta ya está cancelada");
    await assertOpenPeriod(tx, actor.businessId, sale.createdAt);
    if (sale.invoice && sale.invoice.status === "STAMPED" && sale.invoice.kind === "INDIVIDUAL") {
      throw new AppError(409, "La venta está facturada. Cancela primero la factura.");
    }

    const { count } = await tx.sale.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    if (count === 0) throw new AppError(409, "La venta ya está cancelada");

    const restocks: { productId: string; quantity: Decimal; unitCost: Decimal }[] = [];
    for (const item of sale.items) {
      const pending = D(item.quantity).minus(item.returnedQuantity);
      if (pending.lte(0)) continue;
      if (item.ingredients.length > 0) {
        // Plato con receta: regresan los insumos de lo no devuelto.
        const share = pending.div(item.quantity);
        for (const used of item.ingredients) {
          restocks.push({
            productId: used.ingredientId,
            quantity: qty(D(used.quantity).times(share)),
            unitCost: used.unitCost,
          });
        }
      } else if (item.product.trackStock) {
        restocks.push({ productId: item.productId, quantity: pending, unitCost: item.unitCost });
      }
    }
    for (const r of restocks.sort((a, b) => a.productId.localeCompare(b.productId))) {
      if (r.quantity.lte(0)) continue;
      const product = await applyStockChange(tx, actor, {
        productId: r.productId,
        delta: r.quantity,
        type: "SALE_CANCEL",
        unitCost: r.unitCost,
        referenceId: sale.id,
        notes: reason,
      });
      if (product.trackExpiry) await restoreBatches(tx, r.productId, r.quantity);
    }

    // Lo que queda de cada forma de pago (lo cobrado menos lo ya devuelto por esa forma).
    const refundedWith = (method: string) =>
      sum(sale.returns.filter((r) => r.refundMethod === method).map((r) => r.total));
    const remaining = (method: string) => paidWith(sale.payments, method).minus(refundedWith(method));

    if (sale.customerId && paidWith(sale.payments, "CREDIT").gt(0)) {
      const owed = remaining("CREDIT");
      if (owed.gt(0)) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: owed } } });
      }
    }

    // Si la venta cobrada en efectivo pertenece a otro turno, el reembolso sale de la caja actual.
    if (paidWith(sale.payments, "CASH").gt(0)) {
      const open = await getOpenSession(tx, actor.businessId);
      if (open && open.id !== sale.cashSessionId) {
        // Lo que ya se devolvió en dinero por otra forma (p. ej. tarjeta) también descuenta del efectivo.
        const moneyMethods = ["CASH", "CARD", "TRANSFER", "YAPPY"];
        const moneyLeft = sum(moneyMethods.map(remaining));
        const cashLeft = remaining("CASH");
        const amount = cashLeft.lt(moneyLeft) ? cashLeft : moneyLeft;
        if (amount.gt(0)) {
          await tx.cashMovement.create({
            data: {
              type: "OUT",
              amount,
              reason: `Cancelación de venta #${sale.folio}`,
              source: "SALE_CANCEL",
              cashSessionId: open.id,
              businessId: actor.businessId,
              userId: actor.userId,
            },
          });
        }
      }
    }

    if (sale.customerId && (sale.pointsEarned > 0 || sale.pointsRedeemed > 0)) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { points: { increment: sale.pointsRedeemed - sale.pointsEarned } },
      });
    }

    // Pagada con vale: lo no devuelto regresa al saldo del vale.
    if (sale.giftCardId && paidWith(sale.payments, "GIFT_CARD").gt(0)) {
      await refundGiftCard(tx, actor, sale.giftCardId, remaining("GIFT_CARD"), sale.id);
    }

    // Si cerraba una cuenta abierta, la cuenta se reabre para corregirla y cobrarla de nuevo.
    await tx.openOrder.updateMany({ where: { saleId: sale.id }, data: { status: "OPEN", saleId: null } });

    // El uso del cupón se devuelve.
    if (sale.couponId) {
      await tx.coupon.updateMany({ where: { id: sale.couponId, uses: { gt: 0 } }, data: { uses: { decrement: 1 } } });
    }

    // Si cobraba un pedido en línea, el pedido vuelve a quedar listo para cobrarse de nuevo.
    await tx.onlineOrder.updateMany({ where: { saleId: sale.id }, data: { status: "READY", saleId: null } });

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
      include: { items: { include: { product: true, ingredients: true } }, payments: true, returns: true },
    });
    if (!sale) throw notFound("Venta");
    if (sale.status === "CANCELLED") throw new AppError(409, "La venta está cancelada");
    await assertOpenPeriod(tx, actor.businessId, new Date());

    // Límite de cada forma de reembolso: el fiado se descuenta del saldo, el vale vuelve al vale y el
    // dinero (efectivo, tarjeta, transferencia, Yappy) se devuelve hasta lo cobrado en dinero.
    const group = (method: string) => (method === "CREDIT" || method === "GIFT_CARD" ? method : "MONEY");
    const refundGroup = group(input.refundMethod);
    const paidInGroup = sum(sale.payments.filter((p) => group(p.method) === refundGroup).map((p) => p.amount));
    const refundedInGroup = sum(sale.returns.filter((r) => group(r.refundMethod) === refundGroup).map((r) => r.total));
    if (paidInGroup.lte(0)) {
      throw new AppError(
        400,
        refundGroup === "CREDIT"
          ? "Solo las ventas fiadas pueden abonarse a la cuenta del cliente"
          : refundGroup === "GIFT_CARD" || paidWith(sale.payments, "CREDIT").lte(0)
            ? "Las ventas pagadas con vale se devuelven al mismo vale"
            : "Las ventas fiadas se devuelven descontando del saldo del cliente"
      );
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
    // Tolerancia de centavos por el prorrateo del descuento entre renglones.
    const available = paidInGroup.minus(refundedInGroup);
    if (total.minus(available).gt(0.05)) {
      throw new AppError(
        400,
        `Solo se pueden devolver ${available.toFixed(2)} por ${PAYMENT_METHOD_LABELS[refundGroup === "MONEY" ? input.refundMethod : refundGroup]}`
      );
    }

    for (const line of lines) {
      const { count } = await tx.saleItem.updateMany({
        where: {
          id: line.item.id,
          returnedQuantity: { lte: D(line.item.quantity).minus(line.quantity) },
        },
        data: { returnedQuantity: { increment: line.quantity } },
      });
      if (count === 0) throw new AppError(409, "La devolución excede lo vendido");
      // Plato con receta: regresan sus insumos en proporción a lo devuelto.
      const restocks =
        line.item.ingredients.length > 0
          ? line.item.ingredients.map((used) => ({
              productId: used.ingredientId,
              quantity: qty(D(used.quantity).times(line.quantity).div(line.item.quantity)),
              unitCost: used.unitCost,
            }))
          : line.item.product.trackStock
            ? [{ productId: line.item.productId, quantity: line.quantity, unitCost: line.item.unitCost }]
            : [];
      for (const r of restocks) {
        if (r.quantity.lte(0)) continue;
        const product = await applyStockChange(tx, actor, {
          productId: r.productId,
          delta: r.quantity,
          type: "SALE_RETURN",
          unitCost: r.unitCost,
          referenceId: returnId,
          notes: input.reason,
        });
        if (product.trackExpiry) await restoreBatches(tx, r.productId, r.quantity);
      }
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
    if (input.refundMethod === "GIFT_CARD" && sale.giftCardId) {
      await refundGiftCard(tx, actor, sale.giftCardId, total, sale.id);
    }

    await audit(tx, actor, "sale.return", "Sale", sale.id, { folio: sale.folio, total: total.toNumber() });
    return saleReturn;
  });
}

/** " (+Queso, +Tocino)" para mostrar los extras de un renglón. */
export function modifierSuffix(modifiers: unknown) {
  return Array.isArray(modifiers) && modifiers.length > 0
    ? ` (${modifiers.map((m: { name: string }) => `+${m.name}`).join(", ")})`
    : "";
}

/** Texto del ticket para compartir por WhatsApp. */
export function receiptText(
  sale: Awaited<ReturnType<typeof getSale>>,
  business: {
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    phone?: string | null;
    address?: string | null;
    showBalboa?: boolean;
    ruc?: string | null;
    dv?: string | null;
    country?: string;
  }
) {
  const fmt = (n: Decimal | number) =>
    formatCurrency(Number(n), business.currency, business.locale, business.showBalboa);
  const date = new Intl.DateTimeFormat(business.locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: business.timezone,
  }).format(sale.createdAt);
  const lines = [
    `*${business.name}*`,
    business.ruc ? `RUC ${business.ruc}${business.dv ? ` DV ${business.dv}` : ""}` : null,
    business.address,
    business.phone ? `Tel. ${business.phone}` : null,
    `Ticket #${sale.folio} · ${date}`,
    "",
    ...sale.items.map(
      (i) => `${i.quantity.toString()} x ${i.product.name}${modifierSuffix(i.modifiers)}  ${fmt(i.subtotal)}`
    ),
    "",
    D(sale.seniorDiscount).gt(0)
      ? `Descuento de jubilado${sale.seniorId ? ` (${sale.seniorId})` : ""}: -${fmt(sale.seniorDiscount)}`
      : null,
    D(sale.discount).gt(0) ? `Descuento: -${fmt(sale.discount)}` : null,
    sale.coupon && D(sale.couponDiscount).gt(0) ? `Cupón ${sale.coupon.code}: -${fmt(sale.couponDiscount)}` : null,
    D(sale.pointsDiscount).gt(0) ? `Puntos canjeados (${sale.pointsRedeemed}): -${fmt(sale.pointsDiscount)}` : null,
    sale.pointsEarned > 0 ? `Ganaste ${sale.pointsEarned} puntos` : null,
    `*Total: ${fmt(sale.total)}*`,
    ...(sale.payments.length > 1
      ? [
          "Pagos:",
          ...sale.payments.map(
            (p) => `  ${PAYMENT_METHOD_LABELS[p.method]} ${fmt(p.amount)}${p.reference ? ` (ref. ${p.reference})` : ""}`
          ),
        ]
      : [
          `Pago: ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}${sale.paymentReference ? ` (ref. ${sale.paymentReference})` : ""}`,
        ]),
    sale.change && D(sale.change).gt(0) ? `Cambio: ${fmt(sale.change)}` : null,
    sale.status === "CANCELLED" ? "VENTA CANCELADA" : null,
    "",
    "¡Gracias por su compra!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
