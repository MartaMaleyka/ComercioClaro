import { describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { graceEnd, planPrice } from "@/server/billing";
import { signStripePayload, stripeForm, toMinorUnits, verifyStripeSignature } from "@/server/billing-providers";

describe("precio del plan", () => {
  it("mensual cubre un mes y anual doce", () => {
    const plan = { priceMonthly: D(19.99), priceYearly: D(199) };
    expect(planPrice(plan, "MONTHLY")).toEqual({ amount: D(19.99), months: 1 });
    expect(planPrice(plan, "YEARLY")).toEqual({ amount: D(199), months: 12 });
  });

  it("sin precio anual cobra doce meses", () => {
    expect(planPrice({ priceMonthly: D(10), priceYearly: null }, "YEARLY").amount.toNumber()).toBe(120);
  });

  it("suspende al pasar los días de gracia", () => {
    expect(graceEnd(new Date("2026-10-01T00:00:00Z"), { graceDays: 7 }).toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("Stripe", () => {
  it("convierte a centavos", () => {
    expect(toMinorUnits(D(19.99))).toBe(1999);
    expect(toMinorUnits(D(0.1).plus(0.2))).toBe(30);
  });

  it("codifica parámetros anidados", () => {
    expect(
      stripeForm({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { unit_amount: 1999 } }],
        metadata: { chargeId: "c1" },
        skip: undefined,
      })
    ).toEqual([
      "mode=payment",
      "line_items%5B0%5D%5Bquantity%5D=1",
      "line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1999",
      "metadata%5BchargeId%5D=c1",
    ]);
    expect(stripeForm({ expand: ["payment_method"] })).toEqual(["expand%5B0%5D=payment_method"]);
  });

  it("verifica la firma del webhook", () => {
    const now = Date.UTC(2026, 9, 1);
    const body = '{"id":"evt_1"}';
    const header = signStripePayload(body, "whsec_test", now);
    expect(verifyStripeSignature(body, header, "whsec_test", now)).toBe(true);
    expect(verifyStripeSignature(body, header, "whsec_otro", now)).toBe(false);
    expect(verifyStripeSignature('{"id":"evt_2"}', header, "whsec_test", now)).toBe(false);
    // Más de 5 minutos: se rechaza (evita reenviar un evento viejo).
    expect(verifyStripeSignature(body, header, "whsec_test", now + 6 * 60 * 1000)).toBe(false);
    expect(verifyStripeSignature(body, null, "whsec_test", now)).toBe(false);
    expect(verifyStripeSignature(body, "t=1", "whsec_test", now)).toBe(false);
  });
});
