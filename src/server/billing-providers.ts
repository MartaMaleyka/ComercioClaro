import crypto from "crypto";
import { D, type Decimal } from "@/lib/decimal";
import { AppError } from "@/lib/errors";

/**
 * Proveedores del cobro en línea de la suscripción. Se elige con BILLING_PROVIDER:
 * - `stripe`: Stripe Checkout y cobros con la tarjeta guardada (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
 * - `simulado`: para pruebas y demostraciones; la tarjeta que termina en 0002 se rechaza al renovar.
 */
export type ProviderName = "stripe" | "simulado";

export interface SavedCard {
  customerId: string | null;
  methodId: string | null;
  label: string | null;
}

export interface CheckoutRequest {
  chargeId: string;
  amount: Decimal;
  currency: string;
  description: string;
  customerId: string | null;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface SavedChargeRequest {
  chargeId: string;
  amount: Decimal;
  currency: string;
  description: string;
  customerId: string | null;
  methodId: string;
}

export type SavedChargeResult =
  | { ok: true; externalId: string }
  | { ok: false; externalId: string | null; error: string };

export interface BillingProvider {
  name: ProviderName;
  createCheckout(req: CheckoutRequest): Promise<{ externalId: string; url: string }>;
  chargeSaved(req: SavedChargeRequest): Promise<SavedChargeResult>;
}

export function providerName(): ProviderName | null {
  const value = process.env.BILLING_PROVIDER;
  return value === "stripe" || value === "simulado" ? value : null;
}

export function billingProvider(): BillingProvider | null {
  const name = providerName();
  if (name === "stripe") return stripeProvider;
  if (name === "simulado") return simulatedProvider;
  return null;
}

// ---------- Simulado ----------

export const SIMULATED_DECLINE = "0002";

export const simulatedProvider: BillingProvider = {
  name: "simulado",
  async createCheckout(req) {
    return { externalId: `sim_cs_${req.chargeId}`, url: `/configuracion/plan/pago-simulado?cargo=${req.chargeId}` };
  },
  async chargeSaved(req) {
    if (req.methodId.endsWith(SIMULATED_DECLINE)) {
      return {
        ok: false,
        externalId: `sim_pi_${req.chargeId}`,
        error: "Tarjeta rechazada: fondos insuficientes (simulado)",
      };
    }
    return { ok: true, externalId: `sim_pi_${req.chargeId}` };
  },
};

/** Tarjeta guardada al pagar en el checkout simulado. */
export function simulatedCard(businessId: string, last4: string): SavedCard {
  return { customerId: `sim_cus_${businessId}`, methodId: `sim_pm_${last4}`, label: `Tarjeta de prueba •••• ${last4}` };
}

// ---------- Stripe ----------

const STRIPE_API = "https://api.stripe.com/v1";

/** Monto en la unidad mínima de la moneda (centavos). */
export function toMinorUnits(amount: Decimal) {
  return D(amount).times(100).toDecimalPlaces(0).toNumber();
}

/** Codifica objetos anidados como los espera la API de Stripe: a[b][c]=valor. */
export function stripeForm(params: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(...stripeForm(value as Record<string, unknown>, name));
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object" && v !== null)
          parts.push(...stripeForm(v as Record<string, unknown>, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

interface StripeError {
  error?: { message?: string; code?: string; payment_intent?: { id: string } };
}

async function stripe<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
  idempotencyKey?: string
): Promise<{ ok: boolean; status: number; body: T & StripeError }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError(503, "El cobro con Stripe no está configurado (STRIPE_SECRET_KEY)");
  const query = stripeForm(params).join("&");
  const res = await fetch(`${STRIPE_API}${path}${method === "GET" && query ? `?${query}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? query : undefined,
  });
  return { ok: res.ok, status: res.status, body: (await res.json()) as T & StripeError };
}

export const stripeProvider: BillingProvider = {
  name: "stripe",
  async createCheckout(req) {
    const res = await stripe<{ id: string; url: string }>(
      "POST",
      "/checkout/sessions",
      {
        mode: "payment",
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        client_reference_id: req.chargeId,
        ...(req.customerId ? { customer: req.customerId } : { customer_creation: "always", customer_email: req.email }),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: req.currency.toLowerCase(),
              unit_amount: toMinorUnits(req.amount),
              product_data: { name: req.description },
            },
          },
        ],
        // Guarda la tarjeta para las renovaciones automáticas.
        payment_intent_data: { setup_future_usage: "off_session", metadata: { chargeId: req.chargeId } },
        metadata: { chargeId: req.chargeId },
      },
      `checkout-${req.chargeId}`
    );
    if (!res.ok) throw new AppError(502, res.body.error?.message ?? "Stripe no pudo iniciar el pago");
    return { externalId: res.body.id, url: res.body.url };
  },
  async chargeSaved(req) {
    const res = await stripe<{ id: string; status: string }>(
      "POST",
      "/payment_intents",
      {
        amount: toMinorUnits(req.amount),
        currency: req.currency.toLowerCase(),
        customer: req.customerId,
        payment_method: req.methodId,
        off_session: true,
        confirm: true,
        description: req.description,
        metadata: { chargeId: req.chargeId },
      },
      `renewal-${req.chargeId}`
    );
    if (res.ok && res.body.status === "succeeded") return { ok: true, externalId: res.body.id };
    return {
      ok: false,
      externalId: res.body.id ?? res.body.error?.payment_intent?.id ?? null,
      error: res.body.error?.message ?? `El cobro quedó en estado ${res.body.status}`,
    };
  },
};

/** Tarjeta usada en un pago de Stripe (para guardarla y mostrarla). */
export async function stripeCardFromPaymentIntent(paymentIntentId: string): Promise<SavedCard> {
  const res = await stripe<{
    customer: string | null;
    payment_method: { id: string; card?: { brand: string; last4: string } } | null;
  }>("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`, { expand: ["payment_method"] });
  if (!res.ok) throw new AppError(502, res.body.error?.message ?? "No se pudo consultar el pago en Stripe");
  const pm = res.body.payment_method;
  const brand = pm?.card?.brand ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1) : "Tarjeta";
  return {
    customerId: res.body.customer,
    methodId: pm?.id ?? null,
    label: pm?.card ? `${brand} •••• ${pm.card.last4}` : null,
  };
}

/**
 * Verifica la firma `Stripe-Signature` (t=…,v1=…) de un webhook: HMAC-SHA256 de "t.cuerpo" con el
 * secreto, en tiempo constante y con 5 minutos de tolerancia.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some(
    (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))
  );
}

/** Firma un cuerpo como lo hace Stripe (para las pruebas). */
export function signStripePayload(payload: string, secret: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}
