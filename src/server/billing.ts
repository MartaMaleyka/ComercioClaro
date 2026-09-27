import type { BillingCycle, Plan } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/prisma";
import { D, money } from "@/lib/decimal";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { formatCurrency } from "@/lib/utils";
import { accessState } from "@/lib/features";
import { adminAudit, recordSubscriptionPayment } from "./admin";
import {
  billingProvider,
  providerName,
  simulatedCard,
  stripeCardFromPaymentIntent,
  verifyStripeSignature,
  type BillingProvider,
  type SavedCard,
} from "./billing-providers";

/**
 * Cobro automático de la suscripción: el dueño paga en línea desde "Mi plan" y la tarjeta queda
 * guardada; el cron diario avisa, cobra al vencer, reintenta y, pasados los días de gracia, suspende.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Quien registra los pagos y las suspensiones automáticas en la bitácora del super admin. */
export const BILLING_ACTOR = { id: "billing" };

export interface PlatformSettingsValue {
  graceDays: number;
  retryIntervalDays: number;
  maxRetries: number;
  noticeDays: number;
  suspendManualPayers: boolean;
}

export const PLATFORM_DEFAULTS: PlatformSettingsValue = {
  graceDays: 7,
  retryIntervalDays: 2,
  maxRetries: 3,
  noticeDays: 3,
  suspendManualPayers: false,
};

export async function platformSettings(db: Tx | typeof prisma = prisma): Promise<PlatformSettingsValue> {
  const row = await db.platformSettings.findUnique({ where: { id: "platform" } });
  if (!row) return PLATFORM_DEFAULTS;
  return {
    graceDays: row.graceDays,
    retryIntervalDays: row.retryIntervalDays,
    maxRetries: row.maxRetries,
    noticeDays: row.noticeDays,
    suspendManualPayers: row.suspendManualPayers,
  };
}

export async function updatePlatformSettings(admin: { id: string }, input: PlatformSettingsValue) {
  return prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({ where: { id: "platform" }, create: input, update: input });
    await adminAudit(tx, admin, "billing.settings", "PlatformSettings", "platform", { ...input });
    return input;
  });
}

/** Precio y meses que cubre un pago del plan según el ciclo (el anual sin precio propio = 12 meses). */
export function planPrice(plan: Pick<Plan, "priceMonthly" | "priceYearly">, cycle: BillingCycle) {
  if (cycle === "YEARLY") {
    return { amount: money(plan.priceYearly ? D(plan.priceYearly) : D(plan.priceMonthly).times(12)), months: 12 };
  }
  return { amount: money(plan.priceMonthly), months: 1 };
}

function chargeDescription(plan: Pick<Plan, "name">, cycle: BillingCycle) {
  return `ComercioClaro · Plan ${plan.name} (${cycle === "YEARLY" ? "anual" : "mensual"})`;
}

/** Fecha en que se suspende por falta de pago (vencimiento + días de gracia). */
export function graceEnd(paidUntil: Date, settings: Pick<PlatformSettingsValue, "graceDays">) {
  return new Date(paidUntil.getTime() + settings.graceDays * DAY_MS);
}

// ---------- Mi plan ----------

interface OwnerActor {
  businessId: string;
  userId: string;
}

export async function billingOverview(businessId: string) {
  const [business, plans, settings] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: {
        plan: true,
        subscriptionPayments: {
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { plan: { select: { name: true } } },
        },
        subscriptionCharges: {
          where: { status: { in: ["FAILED", "PENDING"] }, kind: "RENEWAL" },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }] }),
    platformSettings(),
  ]);
  const provider = providerName();
  const choices = plans.filter((p) => (p.isPublic || p.id === business.planId) && D(p.priceMonthly).gt(0));
  return {
    provider,
    // Suspendido por el administrador (no por falta de pago): no se puede reactivar pagando.
    canPay: Boolean(provider) && !(business.status === "SUSPENDED" && !business.suspendedByBilling),
    status: business.status,
    access: accessState(business),
    plan: business.plan ? { id: business.plan.id, name: business.plan.name, currency: business.plan.currency } : null,
    billingCycle: business.billingCycle,
    trialEndsAt: business.trialEndsAt,
    paidUntil: business.paidUntil,
    graceUntil:
      business.paidUntil && (business.autoRenew || business.billingFailures > 0 || settings.suspendManualPayers)
        ? graceEnd(business.paidUntil, settings)
        : null,
    autoRenew: business.autoRenew,
    card: business.billingCardLabel,
    failures: business.billingFailures,
    maxRetries: settings.maxRetries,
    nextChargeAt: business.nextChargeAt,
    lastError: business.subscriptionCharges.find((c) => c.status === "FAILED")?.error ?? null,
    plans: choices.map((p) => ({
      id: p.id,
      name: p.name,
      currency: p.currency,
      monthly: planPrice(p, "MONTHLY").amount.toNumber(),
      yearly: planPrice(p, "YEARLY").amount.toNumber(),
    })),
    payments: business.subscriptionPayments.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      amount: money(p.amount).toNumber(),
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      planName: p.plan?.name ?? null,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
    })),
  };
}

/** Crea el cobro y devuelve la dirección del pago (Stripe Checkout o el simulado). */
export async function startCheckout(
  actor: OwnerActor & { email: string },
  input: { planId: string; billingCycle: BillingCycle },
  provider: BillingProvider | null = billingProvider()
) {
  if (!provider) throw new AppError(503, "El pago en línea no está configurado. Contacta al administrador.");
  const [business, plan] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } }),
    prisma.plan.findUnique({ where: { id: input.planId } }),
  ]);
  if (!plan || !plan.active || (!plan.isPublic && plan.id !== business.planId)) throw notFound("Plan");
  if (business.status === "SUSPENDED" && !business.suspendedByBilling) {
    throw new AppError(403, "El administrador suspendió este negocio. Contacta al administrador.");
  }
  const { amount, months } = planPrice(plan, input.billingCycle);
  if (amount.lte(0)) throw new AppError(400, "Este plan no tiene costo");

  const charge = await prisma.subscriptionCharge.create({
    data: {
      businessId: business.id,
      planId: plan.id,
      kind: "CHECKOUT",
      provider: provider.name,
      amount,
      currency: plan.currency,
      months,
      billingCycle: input.billingCycle,
    },
  });
  const base = `${getAppUrl()}/configuracion/plan`;
  const checkout = await provider.createCheckout({
    chargeId: charge.id,
    amount,
    currency: plan.currency,
    description: chargeDescription(plan, input.billingCycle),
    customerId: business.billingCustomerId,
    email: actor.email,
    successUrl: `${base}?pago=ok`,
    cancelUrl: `${base}?pago=cancelado`,
  });
  await prisma.$transaction(async (tx) => {
    await tx.subscriptionCharge.update({ where: { id: charge.id }, data: { externalId: checkout.externalId } });
    await audit(tx, actor, "billing.checkout", "SubscriptionCharge", charge.id, {
      planId: plan.id,
      billingCycle: input.billingCycle,
      amount: amount.toNumber(),
    });
  });
  return { chargeId: charge.id, url: checkout.url };
}

/**
 * Confirma un cobro: registra el pago (una sola vez aunque el webhook llegue repetido), extiende
 * la vigencia y guarda la tarjeta para renovar.
 */
export async function completeCharge(chargeId: string, reference: string | null, card: SavedCard | null) {
  return prisma.$transaction(async (tx) => {
    const charge = await tx.subscriptionCharge.findUnique({ where: { id: chargeId } });
    if (!charge) throw notFound("Cobro");
    // Marca atómica: con dos webhooks a la vez, solo uno la gana.
    const claimed = await tx.subscriptionCharge.updateMany({
      where: { id: chargeId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SUCCEEDED", error: null },
    });
    if (claimed.count === 0) return { duplicate: true as const, paymentId: charge.paymentId };
    const business = await tx.business.findUniqueOrThrow({ where: { id: charge.businessId } });
    const payment = await recordSubscriptionPayment(
      tx,
      BILLING_ACTOR,
      charge.businessId,
      {
        amount: money(charge.amount).toNumber(),
        method: "CARD",
        reference: reference ?? charge.externalId,
        months: charge.months,
        // La renovación sigue desde el vencimiento (aunque se cobre en un reintento); el pago del dueño, desde hoy si ya venció.
        periodStart: charge.kind === "RENEWAL" ? business.paidUntil : null,
        notes: `Cobro en línea (${charge.provider}${charge.kind === "RENEWAL" ? ", renovación automática" : ""})`,
        reactivate: business.suspendedByBilling,
      },
      charge.kind === "CHECKOUT" && charge.planId
        ? { planId: charge.planId, billingCycle: charge.billingCycle }
        : undefined
    );
    await tx.subscriptionCharge.update({ where: { id: chargeId }, data: { paymentId: payment.id } });
    if (card?.methodId) {
      await tx.business.update({
        where: { id: charge.businessId },
        data: {
          billingCustomerId: card.customerId,
          billingMethodId: card.methodId,
          billingCardLabel: card.label,
          autoRenew: true,
        },
      });
    }
    return { duplicate: false as const, paymentId: payment.id };
  });
}

/** Cobro rechazado: cuenta el fallo de la renovación y programa el reintento. */
export async function failCharge(chargeId: string, error: string, now = new Date(), settings?: PlatformSettingsValue) {
  const rules = settings ?? (await platformSettings());
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.subscriptionCharge.updateMany({
      where: { id: chargeId, status: "PENDING" },
      data: { status: "FAILED", error: error.slice(0, 500) },
    });
    if (claimed.count === 0) return null;
    const charge = await tx.subscriptionCharge.findUniqueOrThrow({ where: { id: chargeId } });
    if (charge.kind !== "RENEWAL") return { failures: 0, nextChargeAt: null };
    const business = await tx.business.findUniqueOrThrow({ where: { id: charge.businessId } });
    const failures = business.billingFailures + 1;
    const nextChargeAt =
      failures < rules.maxRetries ? new Date(now.getTime() + rules.retryIntervalDays * DAY_MS) : null;
    await tx.business.update({ where: { id: business.id }, data: { billingFailures: failures, nextChargeAt } });
    await adminAudit(tx, BILLING_ACTOR, "billing.failed", "Business", business.id, { chargeId, error, failures });
    return { failures, nextChargeAt };
  });
}

export async function setAutoRenew(actor: OwnerActor, on: boolean) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
  if (on && !business.billingMethodId) throw new AppError(400, "Primero paga con tarjeta para guardarla");
  return prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: actor.businessId }, data: { autoRenew: on } });
    await audit(tx, actor, on ? "billing.autoRenew.on" : "billing.autoRenew.off", "Business", actor.businessId);
    return { autoRenew: on };
  });
}

export async function removeCard(actor: OwnerActor) {
  return prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: actor.businessId },
      data: { autoRenew: false, billingMethodId: null, billingCardLabel: null },
    });
    await audit(tx, actor, "billing.card.remove", "Business", actor.businessId);
    return { ok: true };
  });
}

/** Checkout simulado: el dueño "paga" con una tarjeta de prueba. */
export async function completeSimulatedCheckout(actor: OwnerActor, chargeId: string, last4: string) {
  if (providerName() !== "simulado") throw new AppError(404, "No encontrado");
  const charge = await prisma.subscriptionCharge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.businessId !== actor.businessId || charge.kind !== "CHECKOUT") throw notFound("Cobro");
  return completeCharge(chargeId, `sim_pi_${chargeId}`, simulatedCard(actor.businessId, last4));
}

export async function simulatedCheckoutDetail(businessId: string, chargeId: string) {
  if (providerName() !== "simulado") throw new AppError(404, "No encontrado");
  const charge = await prisma.subscriptionCharge.findUnique({ where: { id: chargeId }, include: { plan: true } });
  if (!charge || charge.businessId !== businessId) throw notFound("Cobro");
  return {
    id: charge.id,
    status: charge.status,
    amount: money(charge.amount).toNumber(),
    currency: charge.currency,
    planName: charge.plan?.name ?? null,
    billingCycle: charge.billingCycle,
  };
}

// ---------- Webhook de Stripe ----------

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      metadata?: Record<string, string>;
      payment_intent?: string | null;
      payment_status?: string;
      last_payment_error?: { message?: string } | null;
    };
  };
}

/**
 * Procesa un webhook de Stripe ya verificado. Es idempotente: el mismo evento dos veces registra
 * un solo pago. Devuelve qué se hizo (para la respuesta y las pruebas).
 */
export async function handleStripeEvent(
  event: StripeEvent,
  cardFor: (paymentIntentId: string) => Promise<SavedCard> = stripeCardFromPaymentIntent
) {
  const object = event.data.object;
  const chargeId = object.metadata?.chargeId;
  if (!chargeId) return { handled: false };
  const charge = await prisma.subscriptionCharge.findUnique({ where: { id: chargeId } });
  if (!charge) return { handled: false };

  if (event.type === "checkout.session.completed" && object.payment_status === "paid") {
    const pi = object.payment_intent ?? null;
    const card = pi ? await cardFor(pi) : null;
    return { handled: true, ...(await completeCharge(chargeId, pi, card)) };
  }
  if (event.type === "payment_intent.succeeded") {
    // Renovaciones confirmadas después (p. ej. con autenticación): la tarjeta ya estaba guardada.
    return { handled: true, ...(await completeCharge(chargeId, object.id, null)) };
  }
  if (event.type === "payment_intent.payment_failed" && charge.kind === "RENEWAL") {
    await failCharge(chargeId, object.last_payment_error?.message ?? "Pago rechazado");
    return { handled: true };
  }
  if (event.type === "checkout.session.expired") {
    await prisma.subscriptionCharge.updateMany({
      where: { id: chargeId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    return { handled: true };
  }
  return { handled: false };
}

export async function receiveStripeWebhook(payload: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (providerName() !== "stripe" || !verifyStripeSignature(payload, signature, secret)) {
    throw new AppError(400, "Firma del webhook inválida");
  }
  return handleStripeEvent(JSON.parse(payload) as StripeEvent);
}

// ---------- Cron diario ----------

type Mailer = typeof sendEmail;

async function ownerEmails(businessId: string) {
  const owners = await prisma.membership.findMany({
    where: { businessId, role: "OWNER", user: { disabledAt: null } },
    include: { user: { select: { email: true } } },
  });
  return owners.map((o) => o.user.email);
}

async function notify(mail: Mailer, businessId: string, subject: string, lines: string[]) {
  const text = [...lines, "", `Mi plan: ${getAppUrl()}/configuracion/plan`].join("\n");
  const html = `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${getAppUrl()}/configuracion/plan">Ver mi plan</a></p>`;
  let sent = 0;
  for (const to of await ownerEmails(businessId)) if (await mail({ to, subject, text, html })) sent++;
  return sent;
}

/**
 * Tareas diarias del cobro:
 * 1. Aviso antes de cobrar (o de vencer, si paga a mano).
 * 2. Cobro de las renovaciones vencidas con la tarjeta guardada, con reintentos.
 * 3. Aviso antes de suspender y suspensión al pasar los días de gracia.
 */
export async function runBillingCron(
  now = new Date(),
  deps: { mail?: Mailer; provider?: BillingProvider | null } = {}
) {
  const mail = deps.mail ?? sendEmail;
  const provider = deps.provider === undefined ? billingProvider() : deps.provider;
  const settings = await platformSettings();
  const result = { renewalNotices: 0, charged: 0, failed: 0, suspensionNotices: 0, suspended: 0 };

  const paid = { status: "ACTIVE" as const, paidUntil: { not: null }, plan: { priceMonthly: { gt: 0 } } };
  const fmtDate = (d: Date, locale: string, timeZone: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(d);

  // 1. Avisos antes del vencimiento.
  const upcoming = await prisma.business.findMany({
    where: { ...paid, paidUntil: { gt: now, lte: new Date(now.getTime() + settings.noticeDays * DAY_MS) } },
    include: { plan: true },
  });
  for (const b of upcoming) {
    if (b.renewalNoticeFor?.getTime() === b.paidUntil!.getTime()) continue;
    const { amount } = planPrice(b.plan!, b.billingCycle);
    const price = formatCurrency(amount.toNumber(), b.plan!.currency, b.locale);
    const date = fmtDate(b.paidUntil!, b.locale, b.timezone);
    const lines =
      b.autoRenew && b.billingMethodId
        ? [
            `Hola, el ${date} renovaremos el plan ${b.plan!.name} de ${b.name}.`,
            `Cobraremos ${price} a tu ${b.billingCardLabel ?? "tarjeta guardada"}.`,
            "Si quieres cambiar de tarjeta o cancelar la renovación, entra a Mi plan.",
          ]
        : [
            `Hola, el plan ${b.plan!.name} de ${b.name} vence el ${date}.`,
            `Para seguir sin interrupciones, paga ${price} en Mi plan.`,
          ];
    await notify(mail, b.id, `Tu plan vence el ${date} · ${b.name}`, lines);
    await prisma.business.update({ where: { id: b.id }, data: { renewalNoticeFor: b.paidUntil } });
    result.renewalNotices++;
  }

  // 2. Renovaciones con la tarjeta guardada.
  if (provider) {
    const due = await prisma.business.findMany({
      where: {
        ...paid,
        paidUntil: { lte: now },
        autoRenew: true,
        billingMethodId: { not: null },
        billingFailures: { lt: settings.maxRetries },
        OR: [{ nextChargeAt: null }, { nextChargeAt: { lte: now } }],
        subscriptionCharges: { none: { kind: "RENEWAL", status: "PENDING" } },
      },
      include: { plan: true },
    });
    for (const b of due) {
      const { amount, months } = planPrice(b.plan!, b.billingCycle);
      const charge = await prisma.subscriptionCharge.create({
        data: {
          businessId: b.id,
          planId: b.planId,
          kind: "RENEWAL",
          provider: provider.name,
          amount,
          currency: b.plan!.currency,
          months,
          billingCycle: b.billingCycle,
        },
      });
      const price = formatCurrency(amount.toNumber(), b.plan!.currency, b.locale);
      let outcome;
      try {
        outcome = await provider.chargeSaved({
          chargeId: charge.id,
          amount,
          currency: b.plan!.currency,
          description: chargeDescription(b.plan!, b.billingCycle),
          customerId: b.billingCustomerId,
          methodId: b.billingMethodId!,
        });
      } catch (err) {
        outcome = {
          ok: false as const,
          externalId: null,
          error: err instanceof Error ? err.message : "Error del proveedor",
        };
      }
      if (outcome.externalId) {
        await prisma.subscriptionCharge.update({ where: { id: charge.id }, data: { externalId: outcome.externalId } });
      }
      if (outcome.ok) {
        await completeCharge(charge.id, outcome.externalId, null);
        await notify(mail, b.id, `Pago recibido · ${b.name}`, [
          `Cobramos ${price} a tu ${b.billingCardLabel ?? "tarjeta"} por el plan ${b.plan!.name}. ¡Gracias!`,
        ]);
        result.charged++;
      } else {
        const failure = await failCharge(charge.id, outcome.error, now, settings);
        const retry = failure?.nextChargeAt
          ? `Lo intentaremos otra vez el ${fmtDate(failure.nextChargeAt, b.locale, b.timezone)}.`
          : "Ya no haremos más intentos automáticos.";
        await notify(mail, b.id, `No pudimos cobrar tu plan · ${b.name}`, [
          `No pudimos cobrar ${price} a tu ${b.billingCardLabel ?? "tarjeta"}: ${outcome.error}.`,
          retry,
          `Si no se paga, el negocio se suspenderá el ${fmtDate(graceEnd(b.paidUntil!, settings), b.locale, b.timezone)}. Puedes pagar con otra tarjeta en Mi plan.`,
        ]);
        result.failed++;
      }
    }
  }

  // 3. Aviso antes de suspender y suspensión por falta de pago.
  const overdue = await prisma.business.findMany({
    where: {
      ...paid,
      paidUntil: { lt: now },
      // Solo el cobro automático (o quien ya tuvo cobros fallidos), salvo que se suspenda también a quien paga a mano.
      ...(settings.suspendManualPayers ? {} : { OR: [{ autoRenew: true }, { billingFailures: { gt: 0 } }] }),
    },
    include: { plan: true },
  });
  for (const b of overdue) {
    const end = graceEnd(b.paidUntil!, settings);
    const date = fmtDate(end, b.locale, b.timezone);
    if (now >= end) {
      const reason = `Falta de pago: el plan venció el ${fmtDate(b.paidUntil!, b.locale, b.timezone)}`;
      await prisma.$transaction(async (tx) => {
        await tx.business.update({
          where: { id: b.id },
          data: { status: "SUSPENDED", suspendedReason: reason, suspendedByBilling: true, nextChargeAt: null },
        });
        await adminAudit(tx, BILLING_ACTOR, "billing.suspend", "Business", b.id, {
          paidUntil: b.paidUntil!.toISOString(),
        });
      });
      await notify(mail, b.id, `Negocio suspendido por falta de pago · ${b.name}`, [
        `${b.name} quedó suspendido porque el plan venció y no se pudo cobrar.`,
        "Tus datos se conservan. Paga en Mi plan para reactivarlo de inmediato.",
      ]);
      result.suspended++;
    } else if (
      now.getTime() >= end.getTime() - settings.noticeDays * DAY_MS &&
      b.suspensionNoticeFor?.getTime() !== b.paidUntil!.getTime()
    ) {
      await notify(mail, b.id, `Tu negocio se suspenderá el ${date} · ${b.name}`, [
        `El plan de ${b.name} está vencido. Si no se paga, el negocio se suspenderá el ${date}.`,
        "Paga en Mi plan o actualiza tu tarjeta para evitarlo.",
      ]);
      await prisma.business.update({ where: { id: b.id }, data: { suspensionNoticeFor: b.paidUntil } });
      result.suspensionNotices++;
    }
  }

  // Checkouts abandonados.
  await prisma.subscriptionCharge.updateMany({
    where: { kind: "CHECKOUT", status: "PENDING", createdAt: { lt: new Date(now.getTime() - DAY_MS) } },
    data: { status: "CANCELLED" },
  });
  return result;
}
