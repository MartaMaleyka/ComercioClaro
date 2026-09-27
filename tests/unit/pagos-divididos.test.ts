import { describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { mainPaymentMethod, resolvePayments } from "@/server/payments";

const base = { paymentMethod: "CASH" as const };

describe("resolución de pagos", () => {
  it("una sola forma de pago cubre el total y da el cambio en efectivo", () => {
    const r = resolvePayments(D(25), { ...base, amountReceived: 30 });
    expect(r.method).toBe("CASH");
    expect(r.change?.toNumber()).toBe(5);
    expect(r.payments.map((p) => [p.method, p.amount.toNumber()])).toEqual([["CASH", 25]]);
    expect(() => resolvePayments(D(25), { ...base, amountReceived: 20 })).toThrow(/menor al total/);
    const card = resolvePayments(D(25), { paymentMethod: "CARD", paymentReference: "1234" });
    expect(card.payments[0]).toMatchObject({ method: "CARD", reference: "1234" });
  });

  it("pago dividido: el efectivo cubre lo que falta y el cambio sale solo del efectivo", () => {
    const r = resolvePayments(D(25), {
      ...base,
      payments: [
        { method: "CARD", amount: 15, reference: "V-1" },
        { method: "CASH", amount: 20 },
      ],
    });
    expect(r.method).toBe("MIXED");
    expect(r.amountReceived?.toNumber()).toBe(20);
    expect(r.change?.toNumber()).toBe(10);
    expect(r.payments.map((p) => [p.method, p.amount.toNumber()])).toEqual([
      ["CASH", 10],
      ["CARD", 15],
    ]);
  });

  it("valida que la suma cubra el total", () => {
    const split = (payments: { method: "CASH" | "CARD" | "CREDIT"; amount: number }[]) =>
      resolvePayments(D(25), { ...base, payments });
    expect(() =>
      split([
        { method: "CARD", amount: 10 },
        { method: "CREDIT", amount: 10 },
      ])
    ).toThrow(/Falta por cubrir 5.00/);
    expect(() =>
      split([
        { method: "CARD", amount: 20 },
        { method: "CREDIT", amount: 10 },
      ])
    ).toThrow(/exceden/);
    expect(() =>
      split([
        { method: "CARD", amount: 25 },
        { method: "CASH", amount: 5 },
      ])
    ).toThrow(/exceden/);
    expect(() =>
      split([
        { method: "CARD", amount: 10 },
        { method: "CASH", amount: 5 },
      ])
    ).toThrow(/Falta por cubrir 10.00/);
    expect(() =>
      split([
        { method: "CARD", amount: 10 },
        { method: "CARD", amount: 15 },
      ])
    ).toThrow(/un solo renglón/);
    expect(
      split([
        { method: "CARD", amount: 10 },
        { method: "CREDIT", amount: 15 },
      ]).method
    ).toBe("MIXED");
    expect(split([{ method: "CARD", amount: 25 }]).method).toBe("CARD");
  });

  it("la forma principal de un pago dividido es la de mayor monto", () => {
    expect(
      mainPaymentMethod({
        paymentMethod: "MIXED",
        payments: [
          { method: "CASH", amount: 5 },
          { method: "CARD", amount: 20 },
        ],
      })
    ).toBe("CARD");
    expect(mainPaymentMethod({ paymentMethod: "YAPPY" })).toBe("YAPPY");
  });
});
