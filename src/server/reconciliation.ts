import { AppError } from "@/lib/errors";
import { D } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey, dayRange } from "@/lib/dates";
import { parseBankStatement, reconcile } from "@/lib/reconcile";
import type { PaymentMethod } from "@/generated/prisma/enums";

export type ReconcileMethod = "YAPPY" | "TRANSFER" | "CARD" | "ALL";

const METHODS: Record<ReconcileMethod, PaymentMethod[]> = {
  YAPPY: ["YAPPY"],
  TRANSFER: ["TRANSFER"],
  CARD: ["CARD"],
  ALL: ["YAPPY", "TRANSFER", "CARD"],
};

/** Cruza el estado de cuenta subido con las ventas cobradas por banco en esas fechas. */
export async function reconcileStatement(
  business: {
    id: string;
    timezone: string;
    yappyFeeRate: unknown;
    cardFeeRate: unknown;
    transferFeeRate: unknown;
  },
  input: { csv: string; method: ReconcileMethod }
) {
  let parsed;
  try {
    parsed = parseBankStatement(input.csv);
  } catch (err) {
    throw new AppError(400, err instanceof Error ? err.message : "No se pudo leer el archivo");
  }
  if (parsed.lines.length === 0) throw new AppError(400, "El archivo no tiene depósitos (créditos) para conciliar");

  const dates = parsed.lines.map((l) => l.date).sort();
  // Las ventas pueden haberse hecho hasta dos días antes de que el banco las acredite.
  const range = dayRange(addDays(dates[0], -2), dates[dates.length - 1], business.timezone);
  const sales = await prisma.sale.findMany({
    where: {
      businessId: business.id,
      status: "ACTIVE",
      paymentMethod: { in: METHODS[input.method] },
      createdAt: { gte: range.start, lt: range.end },
    },
    select: { id: true, folio: true, createdAt: true, total: true, paymentReference: true, paymentMethod: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  const feeRate =
    input.method === "YAPPY"
      ? D(business.yappyFeeRate as never).toNumber()
      : input.method === "CARD"
        ? D(business.cardFeeRate as never).toNumber()
        : input.method === "TRANSFER"
          ? D(business.transferFeeRate as never).toNumber()
          : 0;

  const result = reconcile(
    parsed.lines,
    sales.map((s) => ({
      id: s.id,
      folio: s.folio,
      date: dayKey(s.createdAt, business.timezone),
      total: D(s.total).toNumber(),
      reference: s.paymentReference,
      method: s.paymentMethod,
    })),
    feeRate
  );
  return { ...result, skipped: parsed.skipped, from: dates[0], to: dates[dates.length - 1], method: input.method };
}
