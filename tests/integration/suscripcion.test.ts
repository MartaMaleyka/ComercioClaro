import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { accessState } from "@/lib/features";
import {
  billingOverview,
  completeCharge,
  handleStripeEvent,
  receiveStripeWebhook,
  runBillingCron,
  startCheckout,
  updatePlatformSettings,
} from "@/server/billing";
import { signStripePayload, simulatedCard, simulatedProvider, stripeProvider } from "@/server/billing-providers";
import type { sendEmail } from "@/lib/email";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe.skipIf(!hasDatabase)("cobro automático de la suscripción", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BILLING_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  async function setup(paidUntil: Date | null, extra: Record<string, unknown> = {}) {
    const owner = await createOwner();
    const plan = await prisma.plan.create({
      data: { code: `pro-${owner.businessId}`, name: "Pro", priceMonthly: 20, priceYearly: 200, features: [] },
    });
    await prisma.business.update({
      where: { id: owner.businessId },
      data: { planId: plan.id, status: "ACTIVE", paidUntil, ...extra },
    });
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).email;
    return { owner: { ...owner, email }, plan };
  }

  const business = (id: string) => prisma.business.findUniqueOrThrow({ where: { id } });
  const mailer = () => vi.fn<typeof sendEmail>(async () => true);

  it("el pago en línea registra el pago, extiende la vigencia y guarda la tarjeta una sola vez", async () => {
    const paidUntil = new Date(Date.now() + 2 * DAY);
    const { owner, plan } = await setup(paidUntil);
    const { url, chargeId } = await startCheckout(
      owner,
      { planId: plan.id, billingCycle: "YEARLY" },
      simulatedProvider
    );
    expect(url).toBe(`/configuracion/plan/pago-simulado?cargo=${chargeId}`);

    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { chargeId } } },
    };
    const card = vi.fn(async () => ({ customerId: "cus_1", methodId: "pm_1", label: "Visa •••• 4242" }));
    const first = await handleStripeEvent(event, card);
    const again = await handleStripeEvent(event, card);
    expect(first).toMatchObject({ handled: true, duplicate: false });
    expect(again).toMatchObject({ handled: true, duplicate: true });

    const payments = await prisma.subscriptionPayment.findMany({ where: { businessId: owner.businessId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ method: "CARD", reference: "pi_1", createdById: "billing" });
    expect(Number(payments[0].amount)).toBe(200);
    const b = await business(owner.businessId);
    const expected = new Date(paidUntil);
    expected.setUTCMonth(expected.getUTCMonth() + 12);
    expect(b.paidUntil?.toISOString()).toBe(expected.toISOString());
    expect(b).toMatchObject({
      billingCycle: "YEARLY",
      autoRenew: true,
      billingMethodId: "pm_1",
      billingCardLabel: "Visa •••• 4242",
    });
    const overview = await billingOverview(owner.businessId);
    expect(overview.payments).toHaveLength(1);
    expect(overview.card).toBe("Visa •••• 4242");
  });

  it("dos confirmaciones a la vez registran un solo pago", async () => {
    const { owner, plan } = await setup(new Date());
    const { chargeId } = await startCheckout(owner, { planId: plan.id, billingCycle: "MONTHLY" }, simulatedProvider);
    const card = simulatedCard(owner.businessId, "4242");
    const results = await Promise.all([completeCharge(chargeId, "a", card), completeCharge(chargeId, "b", card)]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await prisma.subscriptionPayment.count({ where: { businessId: owner.businessId } })).toBe(1);
  });

  it("avisa antes de cobrar una sola vez y renueva desde el vencimiento", async () => {
    const paidUntil = new Date(Date.now() + 2 * DAY);
    const { owner } = await setup(paidUntil, {
      autoRenew: true,
      billingCustomerId: "sim_cus",
      billingMethodId: "sim_pm_4242",
      billingCardLabel: "Tarjeta de prueba •••• 4242",
    });
    const mail = mailer();
    expect((await runBillingCron(new Date(), { mail, provider: simulatedProvider })).renewalNotices).toBe(1);
    expect(mail.mock.calls[0][0]).toMatchObject({ to: owner.email });
    expect(mail.mock.calls[0][0].text).toContain("•••• 4242");
    expect((await runBillingCron(new Date(), { mail, provider: simulatedProvider })).renewalNotices).toBe(0);

    await prisma.business.update({ where: { id: owner.businessId }, data: { paidUntil: new Date(Date.now() - HOUR) } });
    const due = (await business(owner.businessId)).paidUntil!;
    const result = await runBillingCron(new Date(), { mail, provider: simulatedProvider });
    expect(result.charged).toBe(1);
    const renewed = new Date(due);
    renewed.setUTCMonth(renewed.getUTCMonth() + 1);
    expect((await business(owner.businessId)).paidUntil?.toISOString()).toBe(renewed.toISOString());
    const charge = await prisma.subscriptionCharge.findFirstOrThrow({ where: { kind: "RENEWAL" } });
    expect(charge).toMatchObject({ status: "SUCCEEDED", externalId: `sim_pi_${charge.id}` });
    // Ya está pagado: no se vuelve a cobrar.
    expect((await runBillingCron(new Date(), { mail, provider: simulatedProvider })).charged).toBe(0);
  });

  it("reintenta, avisa y suspende al pasar la gracia; pagar en línea lo reactiva", async () => {
    const { owner, plan } = await setup(new Date(Date.now() - HOUR), {
      autoRenew: true,
      billingMethodId: "sim_pm_0002",
      billingCardLabel: "Tarjeta de prueba •••• 0002",
    });
    const mail = mailer();
    const now = Date.now();
    const run = (offset: number) => runBillingCron(new Date(now + offset), { mail, provider: simulatedProvider });

    expect(await run(0)).toMatchObject({ failed: 1, suspended: 0 });
    let b = await business(owner.businessId);
    expect(b.billingFailures).toBe(1);
    expect(b.nextChargeAt?.getTime()).toBe(now + 2 * DAY);
    expect(await run(DAY)).toMatchObject({ failed: 0 });
    expect(await run(2 * DAY + 60_000)).toMatchObject({ failed: 1 });
    expect(await run(4 * DAY + 120_000)).toMatchObject({ failed: 1, suspensionNotices: 1 });
    b = await business(owner.businessId);
    expect(b.billingFailures).toBe(3);
    expect(b.nextChargeAt).toBeNull();
    // Sin más reintentos y el aviso de suspensión ya se envió.
    expect(await run(5 * DAY)).toMatchObject({ failed: 0, suspensionNotices: 0, suspended: 0 });
    expect(await run(7 * DAY)).toMatchObject({ suspended: 1 });
    b = await business(owner.businessId);
    expect(b).toMatchObject({ status: "SUSPENDED", suspendedByBilling: true });
    expect(accessState(b).blocked).toBe(true);
    const failure = mail.mock.calls.find((c) => c[0].subject.startsWith("No pudimos"));
    expect(failure![0].text).toContain("fondos insuficientes");
    expect(await prisma.adminAuditLog.count({ where: { action: "billing.suspend", entityId: owner.businessId } })).toBe(
      1
    );

    // El dueño paga con otra tarjeta: se reactiva y se reinician los reintentos.
    const { chargeId } = await startCheckout(owner, { planId: plan.id, billingCycle: "MONTHLY" }, simulatedProvider);
    await completeCharge(chargeId, "sim", simulatedCard(owner.businessId, "4242"));
    b = await business(owner.businessId);
    expect(b).toMatchObject({
      status: "ACTIVE",
      suspendedByBilling: false,
      billingFailures: 0,
      billingMethodId: "sim_pm_4242",
    });
    expect(b.paidUntil!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
  });

  it("quien paga a mano solo se suspende si el super admin lo configura", async () => {
    const { owner } = await setup(new Date(Date.now() - 10 * DAY));
    const mail = mailer();
    expect((await runBillingCron(new Date(), { mail, provider: simulatedProvider })).suspended).toBe(0);
    await updatePlatformSettings(
      { id: "admin" },
      { graceDays: 7, retryIntervalDays: 2, maxRetries: 3, noticeDays: 3, suspendManualPayers: true }
    );
    expect((await runBillingCron(new Date(), { mail, provider: simulatedProvider })).suspended).toBe(1);
    expect((await business(owner.businessId)).status).toBe("SUSPENDED");
  });

  it("un negocio suspendido por el administrador no se reactiva pagando", async () => {
    const { owner, plan } = await setup(new Date(), { status: "SUSPENDED", suspendedReason: "Fraude" });
    await expect(startCheckout(owner, { planId: plan.id, billingCycle: "MONTHLY" }, simulatedProvider)).rejects.toThrow(
      /suspendió/
    );
    expect((await billingOverview(owner.businessId)).canPay).toBe(false);
  });

  it("el webhook exige la firma de Stripe", async () => {
    const { owner, plan } = await setup(new Date());
    const { chargeId } = await startCheckout(owner, { planId: plan.id, billingCycle: "MONTHLY" }, simulatedProvider);
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const payload = JSON.stringify({
      id: "evt_2",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_9", metadata: { chargeId } } },
    });
    await expect(receiveStripeWebhook(payload, signStripePayload(payload, "whsec_otro"))).rejects.toThrow(/Firma/);
    expect(await prisma.subscriptionPayment.count()).toBe(0);
    expect(await receiveStripeWebhook(payload, signStripePayload(payload, "whsec_test"))).toMatchObject({
      handled: true,
      duplicate: false,
    });
    expect(await prisma.subscriptionPayment.count()).toBe(1);
  });

  it("Stripe Checkout guarda la tarjeta para renovar y la renovación usa una clave de idempotencia", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const body = url.endsWith("/checkout/sessions")
          ? { id: "cs_test", url: "https://checkout.stripe.com/c/cs_test" }
          : { error: { message: "Your card was declined.", payment_intent: { id: "pi_x" } } };
        return new Response(JSON.stringify(body), { status: url.endsWith("/checkout/sessions") ? 200 : 402 });
      })
    );
    const { owner, plan } = await setup(new Date());
    const { url, chargeId } = await startCheckout(owner, { planId: plan.id, billingCycle: "MONTHLY" }, stripeProvider);
    expect(url).toBe("https://checkout.stripe.com/c/cs_test");
    const body = decodeURIComponent(String(calls[0].init.body));
    expect(body).toContain("payment_intent_data[setup_future_usage]=off_session");
    expect(body).toContain("line_items[0][price_data][unit_amount]=2000");
    expect(body).toContain(`metadata[chargeId]=${chargeId}`);
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe(`checkout-${chargeId}`);
    expect((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: chargeId } })).externalId).toBe("cs_test");

    const declined = await stripeProvider.chargeSaved({
      chargeId: "c2",
      amount: plan.priceMonthly,
      currency: "USD",
      description: "x",
      customerId: "cus",
      methodId: "pm",
    });
    expect(declined).toEqual({ ok: false, externalId: "pi_x", error: "Your card was declined." });
    expect(decodeURIComponent(String(calls[1].init.body))).toContain("off_session=true");
  });
});
