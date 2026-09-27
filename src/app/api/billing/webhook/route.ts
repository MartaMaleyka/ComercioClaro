import { handler } from "@/lib/api";
import { receiveStripeWebhook } from "@/server/billing";

/** Webhook de Stripe: verifica la firma con STRIPE_WEBHOOK_SECRET y registra el pago. */
export const POST = handler(async (request) => {
  const payload = await request.text();
  return receiveStripeWebhook(payload, request.headers.get("stripe-signature"));
});
