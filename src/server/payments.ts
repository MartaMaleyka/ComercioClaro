import type { PaymentMethod } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { D, money, sum, type Decimal, type DecimalLike } from "@/lib/decimal";

/** Forma de pago tal como llega del punto de venta. En efectivo, `amount` es lo que entrega el cliente. */
export interface PaymentInput {
  method: Exclude<PaymentMethod, "MIXED">;
  amount: number;
  reference?: string | null;
  giftCardCode?: string | null;
  yappyChargeId?: string | null;
}

export interface ResolvedPayment {
  method: Exclude<PaymentMethod, "MIXED">;
  /** Lo que se aplica a la venta (en efectivo, sin el cambio) */
  amount: Decimal;
  reference: string | null;
  giftCardCode: string | null;
  yappyChargeId: string | null;
}

export interface ResolvedPayments {
  payments: ResolvedPayment[];
  /** Forma de pago de la venta: la única, o MIXED si son varias */
  method: PaymentMethod;
  amountReceived: Decimal | null;
  change: Decimal | null;
}

/** Monto cobrado con una forma de pago. */
export function paidWith(payments: { method: string; amount: DecimalLike }[], method: string) {
  return sum(payments.filter((p) => p.method === method).map((p) => p.amount));
}

/**
 * Resuelve cómo se cobra una venta:
 * - Una sola forma de pago (`paymentMethod`): cubre el total; en efectivo, `amountReceived` da el cambio.
 * - Varias (`payments`): lo que no es efectivo no puede pasar del total, y el efectivo cubre lo que falta.
 *   El cambio sale solo de la parte en efectivo.
 */
export function resolvePayments(
  total: Decimal,
  input: {
    paymentMethod: Exclude<PaymentMethod, "MIXED">;
    payments?: PaymentInput[] | null;
    amountReceived?: number | null;
    paymentReference?: string | null;
    giftCardCode?: string | null;
    yappyChargeId?: string | null;
  }
): ResolvedPayments {
  if (!input.payments || input.payments.length === 0) {
    const method = input.paymentMethod;
    let amountReceived: Decimal | null = null;
    let change: Decimal | null = null;
    if (method === "CASH" && input.amountReceived != null) {
      amountReceived = money(input.amountReceived);
      if (amountReceived.lt(total)) throw new AppError(400, "El monto recibido es menor al total");
      change = amountReceived.minus(total);
    }
    return {
      method,
      amountReceived,
      change,
      payments: [
        {
          method,
          amount: total,
          reference: method === "CASH" || method === "CREDIT" ? null : (input.paymentReference ?? null),
          giftCardCode: method === "GIFT_CARD" ? (input.giftCardCode ?? null) : null,
          yappyChargeId: method === "YAPPY" ? (input.yappyChargeId ?? null) : null,
        },
      ],
    };
  }

  const methods = input.payments.map((p) => p.method);
  if (new Set(methods).size !== methods.length) throw new AppError(400, "Usa un solo renglón por forma de pago");
  const others = input.payments.filter((p) => p.method !== "CASH");
  const nonCash = money(sum(others.map((p) => p.amount)));
  if (nonCash.gt(total)) throw new AppError(400, "Los pagos exceden el total de la venta");
  const cash = input.payments.find((p) => p.method === "CASH");
  const pending = total.minus(nonCash);

  const resolved: ResolvedPayment[] = others.map((p) => ({
    method: p.method,
    amount: money(p.amount),
    reference: p.method === "CREDIT" ? null : (p.reference ?? null),
    giftCardCode: p.method === "GIFT_CARD" ? (p.giftCardCode ?? null) : null,
    yappyChargeId: p.method === "YAPPY" ? (p.yappyChargeId ?? null) : null,
  }));
  let amountReceived: Decimal | null = null;
  let change: Decimal | null = null;
  if (cash) {
    const tendered = money(cash.amount);
    if (pending.lte(0)) throw new AppError(400, "Los pagos exceden el total de la venta");
    if (tendered.lt(pending)) throw new AppError(400, `Falta por cubrir ${pending.minus(tendered).toFixed(2)}`);
    amountReceived = tendered;
    change = tendered.minus(pending);
    resolved.unshift({ method: "CASH", amount: pending, reference: null, giftCardCode: null, yappyChargeId: null });
  } else if (pending.gt(0)) {
    throw new AppError(400, `Falta por cubrir ${pending.toFixed(2)}`);
  }
  return {
    payments: resolved,
    method: resolved.length > 1 ? "MIXED" : resolved[0].method,
    amountReceived,
    change,
  };
}

/** Forma de pago con el mayor monto (para documentos que admiten una sola). */
export function mainPaymentMethod(sale: {
  paymentMethod: string;
  payments?: { method: string; amount: DecimalLike }[];
}) {
  if (sale.paymentMethod !== "MIXED" || !sale.payments?.length) return sale.paymentMethod;
  return [...sale.payments].sort((a, b) => D(b.amount).comparedTo(D(a.amount)))[0].method;
}
