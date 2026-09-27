import type { Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, type Decimal } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayKey } from "@/lib/dates";
import type { Actor } from "./inventory";
import { customersAging } from "./customers";
import { getWhatsappProvider, internationalNumber } from "./whatsapp";

// ---------- Cupones ----------

export interface CouponInput {
  code: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  minPurchase: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  active: boolean;
}

export const normalizeCouponCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Descuento de un cupón sobre un monto (el porcentaje se redondea a centavos; nunca pasa del monto). */
export function couponDiscount(coupon: { kind: string; value: Decimal | number }, amount: Decimal) {
  const raw = coupon.kind === "PERCENT" ? amount.times(D(coupon.value)) : D(coupon.value);
  const discount = money(raw);
  return discount.gt(amount) ? amount : discount;
}

/** Motivo por el que un cupón no se puede usar ahora, o null si es válido. */
export function couponProblem(
  coupon: {
    active: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    maxUses: number | null;
    uses: number;
    minPurchase: Decimal | null;
  },
  amount: Decimal,
  now = new Date()
) {
  if (!coupon.active) return "El cupón no está activo";
  if (coupon.startsAt && coupon.startsAt > now) return "El cupón todavía no es válido";
  if (coupon.endsAt && coupon.endsAt < now) return "El cupón ya venció";
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return "El cupón ya se usó todas las veces permitidas";
  if (coupon.minPurchase && amount.lt(coupon.minPurchase)) {
    return `El cupón aplica en compras desde ${D(coupon.minPurchase).toFixed(2)}`;
  }
  return null;
}

/** Aplica el cupón dentro de la transacción de la venta: suma un uso sin pasar del límite. */
export async function redeemCoupon(tx: Tx, businessId: string, code: string, amount: Decimal) {
  const coupon = await tx.coupon.findUnique({
    where: { businessId_code: { businessId, code: normalizeCouponCode(code) } },
  });
  if (!coupon) throw new AppError(404, "No existe un cupón con ese código");
  const problem = couponProblem(coupon, amount);
  if (problem) throw new AppError(409, problem);
  const { count } = await tx.coupon.updateMany({
    where: { id: coupon.id, ...(coupon.maxUses !== null ? { uses: { lt: coupon.maxUses } } : {}) },
    data: { uses: { increment: 1 } },
  });
  if (count === 0) throw new AppError(409, "El cupón ya se usó todas las veces permitidas");
  return { coupon, discount: couponDiscount(coupon, amount) };
}

export async function findCoupon(businessId: string, code: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { businessId_code: { businessId, code: normalizeCouponCode(code) } },
  });
  if (!coupon) throw notFound("Cupón");
  return coupon;
}

export async function listCoupons(businessId: string) {
  const coupons = await prisma.coupon.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
  const sales = await prisma.sale.groupBy({
    by: ["couponId"],
    where: { businessId, status: "ACTIVE", couponId: { in: coupons.map((c) => c.id) } },
    _sum: { total: true, couponDiscount: true },
    _count: true,
  });
  const byCoupon = new Map(sales.map((s) => [s.couponId, s]));
  return coupons.map((c) => ({
    ...c,
    redemptions: byCoupon.get(c.id)?._count ?? 0,
    salesTotal: D(byCoupon.get(c.id)?._sum.total),
    discountTotal: D(byCoupon.get(c.id)?._sum.couponDiscount),
  }));
}

export async function saveCoupon(actor: Actor, input: CouponInput, id?: string) {
  const code = normalizeCouponCode(input.code);
  if (input.kind === "PERCENT" && input.value > 1) throw new AppError(400, "El porcentaje debe ser de 1% a 100%");
  const data = {
    ...input,
    code,
    value: D(input.value),
    minPurchase: input.minPurchase != null ? money(input.minPurchase) : null,
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.coupon.findFirst({ where: { id, businessId: actor.businessId } });
      if (!existing) throw notFound("Cupón");
    }
    const coupon = id
      ? await tx.coupon.update({ where: { id }, data })
      : await tx.coupon.create({ data: { ...data, businessId: actor.businessId } });
    await audit(tx, actor, id ? "coupon.update" : "coupon.create", "Coupon", coupon.id, { code, active: input.active });
    return coupon;
  });
}

// ---------- Segmentos ----------

export type Segment =
  | { type: "ALL" }
  | { type: "BIRTHDAY" }
  | { type: "INACTIVE"; days: number }
  | { type: "FREQUENT"; visits: number; days: number }
  | { type: "OVERDUE" }
  | { type: "TAG"; tag: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clientes del segmento que aceptaron recibir promociones (Ley 81 de 2019) y tienen teléfono.
 */
export async function segmentCustomers(business: { id: string; timezone: string }, segment: Segment, now = new Date()) {
  const where: Prisma.CustomerWhereInput = {
    businessId: business.id,
    archivedAt: null,
    marketingConsent: true,
    phone: { not: null },
  };
  const customers = await prisma.customer.findMany({ where, orderBy: { name: "asc" } });
  const withPhone = customers.filter((c) => c.phone && c.phone.replace(/\D/g, "").length >= 7);
  if (segment.type === "ALL") return withPhone;
  if (segment.type === "TAG") {
    const tag = segment.tag.trim().toLowerCase();
    return withPhone.filter((c) => c.tags.some((t) => t.toLowerCase() === tag));
  }
  if (segment.type === "BIRTHDAY") {
    const month = dayKey(now, business.timezone).slice(5, 7);
    return withPhone.filter((c) => c.birthday && c.birthday.toISOString().slice(5, 7) === month);
  }
  if (segment.type === "OVERDUE") {
    const aging = await customersAging(
      business.id,
      withPhone.map((c) => c.id)
    );
    return withPhone.filter((c) => (aging.get(c.id)?.overdue ?? 0) > 0);
  }
  const ids = withPhone.map((c) => c.id);
  if (segment.type === "INACTIVE") {
    const last = await prisma.sale.groupBy({
      by: ["customerId"],
      where: { businessId: business.id, status: "ACTIVE", customerId: { in: ids } },
      _max: { createdAt: true },
    });
    const since = now.getTime() - segment.days * DAY_MS;
    const inactive = new Set(
      last.filter((l) => l._max.createdAt && l._max.createdAt.getTime() < since).map((l) => l.customerId)
    );
    return withPhone.filter((c) => inactive.has(c.id));
  }
  const visits = await prisma.sale.groupBy({
    by: ["customerId"],
    where: {
      businessId: business.id,
      status: "ACTIVE",
      customerId: { in: ids },
      createdAt: { gte: new Date(now.getTime() - segment.days * DAY_MS) },
    },
    _count: true,
  });
  const frequent = new Set(visits.filter((v) => v._count >= segment.visits).map((v) => v.customerId));
  return withPhone.filter((c) => frequent.has(c.id));
}

/** Mensaje personalizado: {nombre}, {puntos} y {cupón}. */
export function renderMessage(template: string, data: { name: string; points: number; coupon: string | null }) {
  const firstName = data.name.trim().split(/\s+/)[0] ?? data.name;
  return template
    .replace(/\{nombre\}/gi, firstName)
    .replace(/\{puntos\}/gi, String(data.points))
    .replace(/\{cup[oó]n\}/gi, data.coupon ?? "");
}

// ---------- Campañas ----------

export interface CampaignInput {
  name: string;
  message: string;
  segment: Segment;
  couponId: string | null;
}

/** Crea la campaña con la lista de destinatarios del segmento (queda fija al crearse). */
export async function createCampaign(actor: Actor & { timezone: string }, input: CampaignInput) {
  const coupon = input.couponId
    ? await prisma.coupon.findFirst({ where: { id: input.couponId, businessId: actor.businessId } })
    : null;
  if (input.couponId && !coupon) throw notFound("Cupón");
  if (/\{cup[oó]n\}/i.test(input.message) && !coupon) throw new AppError(400, "El mensaje usa {cupón}: elige un cupón");
  const customers = await segmentCustomers({ id: actor.businessId, timezone: actor.timezone }, input.segment);
  if (customers.length === 0) {
    throw new AppError(400, "Ningún cliente del segmento aceptó recibir promociones o tiene teléfono");
  }
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        name: input.name,
        message: input.message,
        segment: input.segment as unknown as Prisma.InputJsonValue,
        couponId: coupon?.id ?? null,
        userId: actor.userId,
        businessId: actor.businessId,
        recipients: {
          create: customers.map((c) => ({
            customerId: c.id,
            phone: c.phone!,
            message: renderMessage(input.message, { name: c.name, points: c.points, coupon: coupon?.code ?? null }),
          })),
        },
      },
    });
    await audit(tx, actor, "campaign.create", "Campaign", campaign.id, {
      segment: input.segment.type,
      recipients: customers.length,
    });
    return campaign;
  });
}

export async function previewSegment(business: { id: string; timezone: string }, segment: Segment) {
  const customers = await segmentCustomers(business, segment);
  return { count: customers.length, sample: customers.slice(0, 5).map((c) => c.name) };
}

/** Marca un destinatario como enviado (envío asistido desde el enlace de WhatsApp). */
export async function markRecipientSent(actor: Actor, recipientId: string) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { id: recipientId, campaign: { businessId: actor.businessId } },
  });
  if (!recipient) throw notFound("Destinatario");
  await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
    await tx.campaign.update({
      where: { id: recipient.campaignId },
      data: { status: "SENT", sentAt: new Date() },
    });
  });
}

/** Envía por la API de WhatsApp Business a los pendientes (o a los que fallaron). */
export async function sendCampaign(actor: Actor & { country: string }, campaignId: string) {
  const provider = getWhatsappProvider();
  if (!provider) throw new AppError(409, "La API de WhatsApp Business no está configurada: usa el envío asistido");
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId: actor.businessId },
    include: { recipients: { where: { status: { in: ["PENDING", "FAILED"] } } } },
  });
  if (!campaign) throw notFound("Campaña");
  let sent = 0;
  let failed = 0;
  for (const r of campaign.recipients) {
    const result = await provider.send(internationalNumber(r.phone, actor.country), r.message);
    await prisma.campaignRecipient.update({
      where: { id: r.id },
      data: result.ok
        ? { status: "SENT", sentAt: new Date(), error: null }
        : { status: "FAILED", error: result.error.slice(0, 300) },
    });
    if (result.ok) sent++;
    else failed++;
  }
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "SENT", sentAt: new Date() } });
    await audit(tx, actor, "campaign.send", "Campaign", campaignId, { provider: provider.name, sent, failed });
  });
  return { sent, failed };
}

/** Días que se atribuyen a la campaña las compras de sus destinatarios. */
export const ATTRIBUTION_DAYS = 14;

export async function listCampaigns(businessId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { businessId },
    include: { coupon: true, recipients: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return campaigns.map(({ recipients, ...c }) => ({
    ...c,
    total: recipients.length,
    sent: recipients.filter((r) => r.status === "SENT").length,
    failed: recipients.filter((r) => r.status === "FAILED").length,
  }));
}

/**
 * Detalle y resultado: canjes del cupón y ventas atribuidas (compras de los destinatarios en
 * los 14 días siguientes a la campaña).
 */
export async function campaignDetail(businessId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, businessId },
    include: {
      coupon: true,
      recipients: { include: { customer: { select: { name: true } } }, orderBy: { customer: { name: "asc" } } },
    },
  });
  if (!campaign) throw notFound("Campaña");
  const start = campaign.sentAt ?? campaign.createdAt;
  const end = new Date(start.getTime() + ATTRIBUTION_DAYS * DAY_MS);
  const customerIds = campaign.recipients.map((r) => r.customerId);
  const [attributed, redemptions] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        businessId,
        status: "ACTIVE",
        customerId: { in: customerIds },
        createdAt: { gte: campaign.createdAt, lt: end },
      },
      _sum: { total: true },
      _count: true,
    }),
    campaign.couponId
      ? prisma.sale.aggregate({
          where: { businessId, status: "ACTIVE", couponId: campaign.couponId, createdAt: { gte: campaign.createdAt } },
          _sum: { total: true, couponDiscount: true },
          _count: true,
        })
      : Promise.resolve(null),
  ]);
  const buyers = await prisma.sale.findMany({
    where: {
      businessId,
      status: "ACTIVE",
      customerId: { in: customerIds },
      createdAt: { gte: campaign.createdAt, lt: end },
    },
    distinct: ["customerId"],
    select: { customerId: true },
  });
  return {
    ...campaign,
    results: {
      attributionDays: ATTRIBUTION_DAYS,
      buyers: buyers.length,
      sales: attributed._count,
      salesTotal: money(D(attributed._sum.total)),
      redemptions: redemptions?._count ?? 0,
      redemptionTotal: money(D(redemptions?._sum.total)),
      discountTotal: money(D(redemptions?._sum.couponDiscount)),
      conversion:
        campaign.recipients.length > 0
          ? D(buyers.length).div(campaign.recipients.length).times(100).toDecimalPlaces(1)
          : D(0),
    },
    apiEnabled: getWhatsappProvider() !== null,
  };
}
