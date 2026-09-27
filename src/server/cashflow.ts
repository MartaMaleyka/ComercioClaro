import type { PaymentMethod } from "@/generated/prisma/enums";
import { notFound } from "@/lib/errors";
import { D, money, sum, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { addDays, dayKey, dayKeysBetween, dayRange, parseDayKey, zonedMidnight } from "@/lib/dates";
import type { Actor } from "./inventory";
import { customersAging } from "./customers";
import { getOpenSession, cashSessionSummary } from "./cash";
import { financialSummary } from "./reports";

/**
 * Flujo de caja proyectado y punto de equilibrio. Todo se calcula al consultar, con lo que
 * ya está registrado: ventas de las últimas 8 semanas, fiado por cobrar, cuentas por pagar,
 * gastos recurrentes y (desde la planilla) sueldos por pagar.
 */

export interface RecurringExpenseInput {
  category: string;
  description: string | null;
  amount: number;
  dayOfMonth: number;
  paymentMethod: Exclude<PaymentMethod, "CREDIT" | "GIFT_CARD" | "MIXED">;
  active: boolean;
}

/** Día efectivo del mes (el 31 en un mes de 30 días cae el 30). */
export function occurrenceDay(year: number, month: number, dayOfMonth: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(dayOfMonth, last);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fechas ("YYYY-MM-DD") en que cae un gasto recurrente entre dos días (inclusive). */
export function occurrencesBetween(dayOfMonth: number, fromKey: string, toKey: string) {
  const result: string[] = [];
  let { year, month } = parseDayKey(fromKey);
  for (;;) {
    const key = `${year}-${pad(month)}-${pad(occurrenceDay(year, month, dayOfMonth))}`;
    if (key > toKey) break;
    if (key >= fromKey) result.push(key);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return result;
}

// ---------- Gastos recurrentes ----------

export async function listRecurringExpenses(businessId: string) {
  return prisma.recurringExpense.findMany({
    where: { businessId },
    orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }, { category: "asc" }],
  });
}

async function todayFor(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  return dayKey(new Date(), business.timezone);
}

/**
 * Crea un gasto recurrente. Si su día de este mes ya pasó, empieza el mes siguiente
 * (el de este mes probablemente ya se registró a mano).
 */
export async function createRecurringExpense(actor: Actor, input: RecurringExpenseInput) {
  const today = await todayFor(actor.businessId);
  const { year, month, day } = parseDayKey(today);
  const passed = occurrenceDay(year, month, input.dayOfMonth) < day;
  return prisma.$transaction(async (tx) => {
    const recurring = await tx.recurringExpense.create({
      data: {
        ...input,
        amount: money(input.amount),
        lastGenerated: passed ? today.slice(0, 7) : null,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    await audit(tx, actor, "recurringExpense.create", "RecurringExpense", recurring.id, {
      category: input.category,
      amount: input.amount,
      dayOfMonth: input.dayOfMonth,
    });
    return recurring;
  });
}

export async function updateRecurringExpense(actor: Actor, id: string, input: RecurringExpenseInput) {
  const existing = await prisma.recurringExpense.findFirst({ where: { id, businessId: actor.businessId } });
  if (!existing) throw notFound("Gasto recurrente");
  return prisma.$transaction(async (tx) => {
    const recurring = await tx.recurringExpense.update({
      where: { id },
      data: { ...input, amount: money(input.amount) },
    });
    await audit(tx, actor, "recurringExpense.update", "RecurringExpense", id, { amount: input.amount });
    return recurring;
  });
}

export async function deleteRecurringExpense(actor: Actor, id: string) {
  const existing = await prisma.recurringExpense.findFirst({ where: { id, businessId: actor.businessId } });
  if (!existing) throw notFound("Gasto recurrente");
  await prisma.$transaction(async (tx) => {
    // Los gastos ya registrados se conservan.
    await tx.recurringExpense.delete({ where: { id } });
    await audit(tx, actor, "recurringExpense.delete", "RecurringExpense", id, { category: existing.category });
  });
}

/**
 * Registra los gastos recurrentes del mes cuyo día ya llegó (lo llama el cron diario).
 * Cada gasto se registra una sola vez por mes aunque el cron corra varias veces.
 */
export async function generateRecurringExpenses(now = new Date()) {
  const rows = await prisma.recurringExpense.findMany({
    where: { active: true },
    include: { business: { select: { timezone: true } } },
  });
  let created = 0;
  for (const r of rows) {
    const today = dayKey(now, r.business.timezone);
    const monthKey = today.slice(0, 7);
    if (r.lastGenerated === monthKey) continue;
    const { year, month, day } = parseDayKey(today);
    const due = occurrenceDay(year, month, r.dayOfMonth);
    if (day < due) continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.recurringExpense.updateMany({
        where: { id: r.id, OR: [{ lastGenerated: null }, { lastGenerated: { not: monthKey } }] },
        data: { lastGenerated: monthKey },
      });
      if (count === 0) return;
      // Mediodía local del día que tocaba, para que la fecha no cambie por zona horaria.
      const date = new Date(zonedMidnight(year, month, due, r.business.timezone).getTime() + 12 * 3_600_000);
      const expense = await tx.expense.create({
        data: {
          category: r.category,
          description: r.description ?? `Gasto recurrente (día ${r.dayOfMonth})`,
          amount: r.amount,
          paymentMethod: r.paymentMethod,
          date,
          recurringId: r.id,
          businessId: r.businessId,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "recurringExpense.generate",
          entity: "Expense",
          entityId: expense.id,
          details: { recurringId: r.id, month: monthKey, amount: r.amount.toNumber() },
          businessId: r.businessId,
        },
      });
      created++;
    });
  }
  return { recurring: rows.length, created };
}

// ---------- Flujo de caja proyectado ----------

export const PROJECTION_DAYS = [30, 60, 90] as const;
const HISTORY_DAYS = 56;

interface DayFlow {
  sales: Decimal;
  collections: Decimal;
  payables: Decimal;
  recurring: Decimal;
  purchases: Decimal;
  payroll: Decimal;
}

const emptyDay = (): DayFlow => ({
  sales: D(0),
  collections: D(0),
  payables: D(0),
  recurring: D(0),
  purchases: D(0),
  payroll: D(0),
});

/**
 * Proyección semana a semana:
 * - Entradas: el promedio cobrado por día de la semana en las últimas 8 semanas (sin lo fiado
 *   ni lo pagado con vale, que no entra como dinero) y el fiado por cobrar según su vencimiento.
 * - Salidas: cuentas por pagar según su vencimiento, gastos recurrentes, compras de contado
 *   (promedio diario de las últimas 8 semanas) y la planilla estimada.
 * Lo vencido (por cobrar y por pagar) se cuenta en el primer día.
 */
export async function cashflowProjection(
  business: { id: string; timezone: string },
  options: { days: number; opening?: number | null },
  now = new Date()
) {
  const tz = business.timezone;
  const today = dayKey(now, tz);
  const end = addDays(today, options.days - 1);
  const keys = dayKeysBetween(today, end);
  const flows = new Map(keys.map((k) => [k, emptyDay()]));
  const at = (key: string) => flows.get(key < today ? today : key);

  const history = dayRange(addDays(today, -HISTORY_DAYS), addDays(today, -1), tz);
  const [byWeekday, purchases, aging, bills, recurring] = await Promise.all([
    prisma.$queryRaw<{ dow: number; amount: Decimal | null }[]>`
      SELECT EXTRACT(DOW FROM (s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS dow,
        SUM(p."amount") AS amount
      FROM "SalePayment" p JOIN "Sale" s ON s."id" = p."saleId"
      WHERE s."businessId" = ${business.id} AND s."status" = 'ACTIVE'
        AND p."method" NOT IN ('CREDIT', 'GIFT_CARD')
        AND s."createdAt" >= ${history.start} AND s."createdAt" < ${history.end}
      GROUP BY 1`,
    prisma.purchase.aggregate({
      where: {
        businessId: business.id,
        status: "ACTIVE",
        onCredit: false,
        createdAt: { gte: history.start, lt: history.end },
      },
      _sum: { total: true },
    }),
    customersAging(business.id),
    prisma.supplierBill.findMany({
      where: { businessId: business.id, status: "OPEN" },
      select: { balance: true, dueDate: true },
    }),
    prisma.recurringExpense.findMany({ where: { businessId: business.id, active: true } }),
  ]);

  const weeks = HISTORY_DAYS / 7;
  const salesByDow = new Map(byWeekday.map((r) => [Number(r.dow), D(r.amount).div(weeks)]));
  const purchasesPerDay = D(purchases._sum.total).div(HISTORY_DAYS);
  for (const key of keys) {
    const flow = flows.get(key)!;
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
    flow.sales = salesByDow.get(dow) ?? D(0);
    flow.purchases = purchasesPerDay;
  }
  for (const customer of aging.values()) {
    for (const charge of customer.charges) {
      if (charge.pending <= 0 || !charge.dueDate) continue;
      const flow = at(dayKey(charge.dueDate, tz));
      if (flow) flow.collections = flow.collections.plus(charge.pending);
    }
  }
  for (const bill of bills) {
    const flow = at(bill.dueDate.toISOString().slice(0, 10));
    if (flow) flow.payables = flow.payables.plus(bill.balance);
  }
  for (const r of recurring) {
    for (const key of occurrencesBetween(r.dayOfMonth, today, end)) {
      // El gasto de este mes ya registrado no se vuelve a contar.
      if (r.lastGenerated === key.slice(0, 7)) continue;
      flows.get(key)!.recurring = flows.get(key)!.recurring.plus(r.amount);
    }
  }
  for (const p of await payrollOutflows(business.id, today, end)) {
    const flow = at(p.date);
    if (flow) flow.payroll = flow.payroll.plus(p.amount);
  }

  let opening = options.opening != null ? D(options.opening) : null;
  let openingSource: "input" | "cash" | "none" = "input";
  if (opening === null) {
    const session = await getOpenSession(prisma, business.id);
    opening = session ? (await cashSessionSummary(prisma, session.id)).expected : D(0);
    openingSource = session ? "cash" : "none";
  }

  const result = [];
  let balance = opening;
  for (let i = 0; i < keys.length; i += 7) {
    const days = keys.slice(i, i + 7).map((k) => flows.get(k)!);
    const total = (field: keyof DayFlow) => money(sum(days.map((d) => d[field])));
    const week = {
      start: keys[i],
      end: keys[Math.min(i + 6, keys.length - 1)],
      sales: total("sales"),
      collections: total("collections"),
      payables: total("payables"),
      recurring: total("recurring"),
      purchases: total("purchases"),
      payroll: total("payroll"),
    };
    const inflows = week.sales.plus(week.collections);
    const outflows = week.payables.plus(week.recurring).plus(week.purchases).plus(week.payroll);
    balance = balance.plus(inflows).minus(outflows);
    result.push({ ...week, inflows, outflows, net: inflows.minus(outflows), balance: money(balance) });
  }
  const negative = result.find((w) => w.balance.lt(0)) ?? null;
  return {
    from: today,
    to: end,
    days: options.days,
    opening: money(opening),
    openingSource,
    weeks: result,
    totals: {
      inflows: money(sum(result.map((w) => w.inflows))),
      outflows: money(sum(result.map((w) => w.outflows))),
    },
    closing: money(balance),
    negativeWeek: negative ? { start: negative.start, balance: negative.balance } : null,
  };
}

/** Sueldos por pagar en el periodo (se completa con la planilla). */
export async function payrollOutflows(
  _businessId: string,
  _fromKey: string,
  _toKey: string
): Promise<{ date: string; amount: Decimal }[]> {
  void _businessId;
  void _fromKey;
  void _toKey;
  return [];
}

/** Sueldos fijos por mes (se completa con la planilla). */
export async function monthlyPayroll(_businessId: string): Promise<Decimal> {
  void _businessId;
  return D(0);
}

// ---------- Punto de equilibrio ----------

const MARGIN_DAYS = 90;

/**
 * Punto de equilibrio del mes: gastos fijos ÷ margen de contribución.
 * - Margen de contribución = (ventas − costo real de lo vendido − comisiones) ÷ ventas, de los últimos 90 días.
 * - Gastos fijos = gastos recurrentes + planilla. Sin gastos recurrentes se usa el promedio
 *   mensual de los gastos de los últimos 90 días.
 * - En días: cuántos días del mes hacen falta al ritmo de venta diario promedio.
 */
export async function breakEven(
  business: { id: string; timezone: string; cardFeeRate?: unknown; transferFeeRate?: unknown; yappyFeeRate?: unknown },
  now = new Date()
) {
  const tz = business.timezone;
  const today = dayKey(now, tz);
  const rates = {
    cardFeeRate: D(business.cardFeeRate as never),
    transferFeeRate: D(business.transferFeeRate as never),
    yappyFeeRate: D(business.yappyFeeRate as never),
  };
  const history = dayRange(addDays(today, -MARGIN_DAYS), addDays(today, -1), tz);
  const monthStart = `${today.slice(0, 7)}-01`;
  const month = dayRange(monthStart, today, tz);
  const [past, current, recurring, payroll] = await Promise.all([
    financialSummary(business.id, history, rates),
    financialSummary(business.id, month, rates),
    prisma.recurringExpense.aggregate({
      where: { businessId: business.id, active: true },
      _sum: { amount: true },
    }),
    monthlyPayroll(business.id),
  ]);

  const revenue = D(past.revenue);
  const contribution = revenue.minus(past.cogs).minus(past.fees.total);
  const marginRatio = revenue.gt(0) ? contribution.div(revenue) : D(0);
  const recurringTotal = D(recurring._sum.amount);
  const fixedSource = recurringTotal.gt(0) || payroll.gt(0) ? "recurring" : "expenses";
  const fixedCosts = money(
    fixedSource === "recurring" ? recurringTotal.plus(payroll) : D(past.expenses).div(MARGIN_DAYS).times(30)
  );
  const breakEvenSales = marginRatio.gt(0) ? money(fixedCosts.div(marginRatio)) : null;
  const dailySales = revenue.div(MARGIN_DAYS);
  const { year, month: m } = parseDayKey(today);
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const daysNeeded = breakEvenSales && dailySales.gt(0) ? Math.ceil(breakEvenSales.div(dailySales).toNumber()) : null;
  const monthSales = D(current.revenue);

  return {
    period: { from: addDays(today, -MARGIN_DAYS), to: addDays(today, -1) },
    revenue: money(revenue),
    contribution: money(contribution),
    marginPercent: marginRatio.times(100).toDecimalPlaces(1),
    fixedCosts,
    fixedSource,
    recurring: money(recurringTotal),
    payroll: money(payroll),
    breakEvenSales,
    dailySales: money(dailySales),
    daysNeeded,
    daysInMonth,
    reachable: daysNeeded !== null && daysNeeded <= daysInMonth,
    month: {
      sales: money(monthSales),
      progress:
        breakEvenSales && breakEvenSales.gt(0) ? monthSales.div(breakEvenSales).times(100).toDecimalPlaces(0) : null,
      reached: breakEvenSales !== null && monthSales.gte(breakEvenSales),
    },
  };
}
