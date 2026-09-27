import { Prisma } from "@/generated/prisma/client";
import { D, money, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { currentPaydayEnd } from "@/lib/credit-terms";
import { customersAging } from "./customers";
import { serviceCommissions } from "./services";
import { payablesSummary } from "./payables";
import { addDays, dayKey, dayKeysBetween, dayRange, startOfDay, startOfMonth } from "@/lib/dates";

interface Range {
  start: Date;
  end: Date;
}

/**
 * Resumen financiero de un periodo:
 * - ingresos = ventas activas − devoluciones
 * - costo de lo vendido = costo registrado al vender − costo devuelto
 * - utilidad bruta = ingresos − costo de lo vendido
 * - utilidad neta = utilidad bruta − gastos + comisiones de recargas y servicios
 * Las compras se reportan aparte como salida de dinero (no son costo hasta que se venden).
 */
export interface FeeRates {
  cardFeeRate?: Decimal | number | null;
  transferFeeRate?: Decimal | number | null;
  yappyFeeRate?: Decimal | number | null;
}

/** Comisión estimada que cobra cada medio de pago sobre lo vendido. */
export function estimateFees(byMethod: { method: string; total: Decimal }[], rates: FeeRates) {
  const rateFor: Record<string, Decimal> = {
    CARD: D(rates.cardFeeRate ?? 0),
    TRANSFER: D(rates.transferFeeRate ?? 0),
    YAPPY: D(rates.yappyFeeRate ?? 0),
  };
  const items = byMethod
    .filter((m) => rateFor[m.method]?.gt(0))
    .map((m) => ({ method: m.method, rate: rateFor[m.method], amount: money(D(m.total).times(rateFor[m.method])) }));
  return { items, total: money(items.reduce((acc, i) => acc.plus(i.amount), D(0))) };
}

export async function financialSummary(businessId: string, range: Range, rates: FeeRates = {}) {
  const saleWhere = { businessId, status: "ACTIVE" as const, createdAt: { gte: range.start, lt: range.end } };
  const [sales, returns, expenses, purchases, byMethod, services] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { total: true, costTotal: true, discount: true }, _count: true }),
    prisma.saleReturn.aggregate({
      where: { businessId, sale: { status: "ACTIVE" }, createdAt: { gte: range.start, lt: range.end } },
      _sum: { total: true, costTotal: true },
    }),
    prisma.expense.aggregate({
      where: { businessId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { businessId, status: "ACTIVE", createdAt: { gte: range.start, lt: range.end } },
      _sum: { total: true },
      _count: true,
    }),
    // Por forma de pago: un pago dividido suma a cada forma su parte.
    prisma.salePayment.groupBy({
      by: ["method"],
      where: { sale: saleWhere },
      _sum: { amount: true },
      _count: true,
    }),
    serviceCommissions(businessId, range),
  ]);

  const revenue = D(sales._sum.total).minus(D(returns._sum.total));
  const cogs = D(sales._sum.costTotal).minus(D(returns._sum.costTotal));
  const grossProfit = revenue.minus(cogs);
  const totalExpenses = D(expenses._sum.amount);
  // Las comisiones por recargas y servicios son ingreso aunque no sean venta de mercancía.
  const netProfit = grossProfit.minus(totalExpenses).plus(services.commissions);
  const paymentMethods = byMethod.map((m) => ({ method: m.method, total: D(m._sum.amount), count: m._count }));
  const fees = estimateFees(paymentMethods, rates);

  return {
    revenue: money(revenue),
    cogs: money(cogs),
    grossProfit: money(grossProfit),
    grossMargin: revenue.gt(0) ? grossProfit.div(revenue).times(100).toDecimalPlaces(1) : D(0),
    expenses: money(totalExpenses),
    netProfit: money(netProfit),
    returns: money(D(returns._sum.total)),
    discounts: money(D(sales._sum.discount)),
    purchases: money(D(purchases._sum.total)),
    purchasesCount: purchases._count,
    salesCount: sales._count,
    averageTicket: sales._count > 0 ? money(D(sales._sum.total).div(sales._count)) : D(0),
    byPaymentMethod: paymentMethods,
    fees,
    netAfterFees: money(netProfit.minus(fees.total)),
    serviceCommissions: money(services.commissions),
    servicesCollected: money(services.collected),
    servicesCount: services.count,
  };
}

type DailyRow = { day: string; amount: Decimal | null; cost: Decimal | null };

export async function dailyTrends(businessId: string, timeZone: string, fromKey: string, toKey: string) {
  const { start, end } = dayRange(fromKey, toKey, timeZone);
  const localDay = (col: string) =>
    Prisma.sql`to_char((${Prisma.raw(col)} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`;

  const [sales, returns, purchases, expenses] = await Promise.all([
    prisma.$queryRaw<DailyRow[]>`
      SELECT ${localDay('"createdAt"')} AS day, SUM("total") AS amount, SUM("costTotal") AS cost
      FROM "Sale"
      WHERE "businessId" = ${businessId} AND "status" = 'ACTIVE' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<DailyRow[]>`
      SELECT ${localDay('r."createdAt"')} AS day, SUM(r."total") AS amount, SUM(r."costTotal") AS cost
      FROM "SaleReturn" r JOIN "Sale" s ON s."id" = r."saleId"
      WHERE r."businessId" = ${businessId} AND s."status" = 'ACTIVE' AND r."createdAt" >= ${start} AND r."createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<DailyRow[]>`
      SELECT ${localDay('"createdAt"')} AS day, SUM("total") AS amount, NULL AS cost
      FROM "Purchase"
      WHERE "businessId" = ${businessId} AND "status" = 'ACTIVE' AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<DailyRow[]>`
      SELECT ${localDay('"date"')} AS day, SUM("amount") AS amount, NULL AS cost
      FROM "Expense"
      WHERE "businessId" = ${businessId} AND "date" >= ${start} AND "date" < ${end}
      GROUP BY 1`,
  ]);

  const toMap = (rows: DailyRow[]) => new Map(rows.map((r) => [r.day, { amount: D(r.amount), cost: D(r.cost) }]));
  const s = toMap(sales);
  const r = toMap(returns);
  const p = toMap(purchases);
  const e = toMap(expenses);

  return dayKeysBetween(fromKey, toKey).map((day) => {
    const revenue = (s.get(day)?.amount ?? D(0)).minus(r.get(day)?.amount ?? D(0));
    const cogs = (s.get(day)?.cost ?? D(0)).minus(r.get(day)?.cost ?? D(0));
    const exp = e.get(day)?.amount ?? D(0);
    return {
      date: day,
      sales: money(revenue).toNumber(),
      grossProfit: money(revenue.minus(cogs)).toNumber(),
      expenses: money(exp).toNumber(),
      netProfit: money(revenue.minus(cogs).minus(exp)).toNumber(),
      purchases: money(p.get(day)?.amount ?? D(0)).toNumber(),
    };
  });
}

type ProductRow = { productId: string; name: string; unit: string; quantity: Decimal; revenue: Decimal; cost: Decimal };

/** Más vendidos con utilidad por producto (descuenta devoluciones y prorratea el descuento general). */
export async function bestSellers(businessId: string, range: Range, limit = 10) {
  const rows = await prisma.$queryRaw<ProductRow[]>`
    SELECT si."productId" AS "productId", p."name" AS name, p."unit"::text AS unit,
      SUM(si."quantity" - si."returnedQuantity") AS quantity,
      SUM(si."subtotal" * (si."quantity" - si."returnedQuantity") / NULLIF(si."quantity", 0)
          * s."total" / NULLIF(s."subtotal", 0)) AS revenue,
      SUM((si."quantity" - si."returnedQuantity") * si."unitCost") AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s."id" = si."saleId"
    JOIN "Product" p ON p."id" = si."productId"
    WHERE s."businessId" = ${businessId} AND s."status" = 'ACTIVE'
      AND s."createdAt" >= ${range.start} AND s."createdAt" < ${range.end}
    GROUP BY si."productId", p."name", p."unit"
    HAVING SUM(si."quantity" - si."returnedQuantity") > 0
    ORDER BY quantity DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    unit: r.unit,
    quantity: D(r.quantity).toNumber(),
    revenue: money(D(r.revenue)).toNumber(),
    profit: money(D(r.revenue).minus(D(r.cost))).toNumber(),
  }));
}

type CategoryRow = { category: string | null; revenue: Decimal; cost: Decimal };

export async function salesByCategory(businessId: string, range: Range) {
  const rows = await prisma.$queryRaw<CategoryRow[]>`
    SELECT c."name" AS category,
      SUM(si."subtotal" * (si."quantity" - si."returnedQuantity") / NULLIF(si."quantity", 0)
          * s."total" / NULLIF(s."subtotal", 0)) AS revenue,
      SUM((si."quantity" - si."returnedQuantity") * si."unitCost") AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s."id" = si."saleId"
    JOIN "Product" p ON p."id" = si."productId"
    LEFT JOIN "Category" c ON c."id" = p."categoryId"
    WHERE s."businessId" = ${businessId} AND s."status" = 'ACTIVE'
      AND s."createdAt" >= ${range.start} AND s."createdAt" < ${range.end}
    GROUP BY c."name"
    ORDER BY revenue DESC NULLS LAST`;
  return rows.map((r) => ({
    category: r.category ?? "Sin categoría",
    revenue: money(D(r.revenue)).toNumber(),
    profit: money(D(r.revenue).minus(D(r.cost))).toNumber(),
  }));
}

export async function expensesByCategory(businessId: string, range: Range) {
  const rows = await prisma.expense.groupBy({
    by: ["category"],
    where: { businessId, date: { gte: range.start, lt: range.end } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  return rows.map((r) => ({ category: r.category, amount: D(r._sum.amount).toNumber() }));
}

/** Resuelve el rango de un reporte: fechas explícitas o los últimos N días. */
export function resolveReportRange(timeZone: string, query: { period: number; from?: string; to?: string }) {
  const today = dayKey(new Date(), timeZone);
  const toKey = query.to ?? today;
  const fromKey = query.from ?? addDays(toKey, -(query.period - 1));
  const [from, to] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
  const days = dayKeysBetween(from, to).length;
  if (days > 366) {
    return { fromKey: addDays(to, -365), toKey: to, ...dayRange(addDays(to, -365), to, timeZone) };
  }
  return { fromKey: from, toKey: to, ...dayRange(from, to, timeZone) };
}

export async function businessReport(
  business: { id: string; timezone: string } & FeeRates,
  query: { period: number; from?: string; to?: string }
) {
  const range = resolveReportRange(business.timezone, query);
  const [summary, trends, top, categories, expenseCategories] = await Promise.all([
    financialSummary(business.id, range, business),
    dailyTrends(business.id, business.timezone, range.fromKey, range.toKey),
    bestSellers(business.id, range),
    salesByCategory(business.id, range),
    expensesByCategory(business.id, range),
  ]);
  return {
    from: range.fromKey,
    to: range.toKey,
    ...summary,
    trends,
    bestSellers: top,
    byCategory: categories,
    expensesByCategory: expenseCategories,
  };
}

/** Reporte consolidado de todas las sucursales donde el usuario es dueño. */
export async function consolidatedReport(userId: string, query: { period: number; from?: string; to?: string }) {
  const memberships = await prisma.membership.findMany({
    where: { userId, role: "OWNER" },
    include: { business: true },
    orderBy: { business: { name: "asc" } },
  });
  const branches = await Promise.all(
    memberships.map(async ({ business }) => {
      const range = resolveReportRange(business.timezone, query);
      const summary = await financialSummary(business.id, range, business);
      return {
        businessId: business.id,
        name: business.name,
        currency: business.currency,
        from: range.fromKey,
        to: range.toKey,
        ...summary,
      };
    })
  );
  const keys = ["revenue", "cogs", "grossProfit", "expenses", "netProfit", "purchases"] as const;
  const totals = Object.fromEntries(
    keys.map((k) => [k, money(branches.reduce((acc, b) => acc.plus(b[k]), D(0)))])
  ) as Record<(typeof keys)[number], Decimal>;
  const currencies = [...new Set(branches.map((b) => b.currency))];
  return { branches, totals, mixedCurrencies: currencies.length > 1 };
}

export async function dashboard(business: { id: string; timezone: string } & FeeRates) {
  const now = new Date();
  const today = { start: startOfDay(now, business.timezone), end: new Date(now.getTime() + 60_000) };
  const month = { start: startOfMonth(now, business.timezone), end: today.end };
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    todaySummary,
    monthSummary,
    lowStock,
    lowStockCount,
    inventory,
    expiring,
    receivables,
    openCash,
    recentSales,
    totalProducts,
    payables,
  ] = await Promise.all([
    financialSummary(business.id, today, business),
    financialSummary(business.id, month, business),
    prisma.product.findMany({
      where: {
        businessId: business.id,
        archivedAt: null,
        trackStock: true,
        stock: { lte: prisma.product.fields.minStock },
      },
      orderBy: { stock: "asc" },
      take: 5,
      select: { id: true, name: true, stock: true, minStock: true, unit: true },
    }),
    prisma.product.count({
      where: {
        businessId: business.id,
        archivedAt: null,
        trackStock: true,
        stock: { lte: prisma.product.fields.minStock },
      },
    }),
    prisma.$queryRaw<{ value: Decimal | null }[]>`
        SELECT SUM(GREATEST("stock", 0) * "cost") AS value FROM "Product"
        WHERE "businessId" = ${business.id} AND "archivedAt" IS NULL`,
    prisma.productBatch.findMany({
      where: { businessId: business.id, remaining: { gt: 0 }, expiresAt: { not: null, lte: soon } },
      include: { product: { select: { id: true, name: true, unit: true } } },
      orderBy: { expiresAt: "asc" },
      take: 5,
    }),
    prisma.customer.aggregate({
      where: { businessId: business.id, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    }),
    prisma.cashSession.findFirst({ where: { businessId: business.id, closedAt: null } }),
    prisma.sale.findMany({
      where: { businessId: business.id },
      include: { items: { include: { product: { select: { name: true } } } }, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.product.count({ where: { businessId: business.id, archivedAt: null } }),
    payablesSummary(business.id, business.timezone),
  ]);

  return {
    today: todaySummary,
    month: monthSummary,
    lowStockProducts: lowStock,
    lowStockCount,
    totalProducts,
    totalInventoryValue: money(D(inventory[0]?.value)),
    expiringBatches: expiring,
    receivables: {
      total: D(receivables._sum.balance),
      customers: receivables._count,
      ...(await overdueReceivables(business.id, business.timezone)),
    },
    cashSession: openCash,
    recentSales,
    // Cuentas por pagar a proveedores: lo vencido y lo que vence en los próximos 7 días.
    payables: { total: payables.total, overdue: payables.overdue, dueThisWeek: payables.dueThisWeek },
  };
}

async function overdueReceivables(businessId: string, timeZone: string) {
  const aging = await customersAging(businessId);
  // Lo que vence de aquí al fin de la quincena (el 15 o el último día del mes), aún no vencido.
  const paydayEnd = currentPaydayEnd(new Date(), timeZone);
  let overdue = 0;
  let overdueCustomers = 0;
  let dueThisPeriod = 0;
  let dueThisPeriodCustomers = 0;
  for (const a of aging.values()) {
    if (a.overdue > 0) {
      overdue += a.overdue;
      overdueCustomers++;
    }
    const due = a.charges
      .filter((c) => c.pending > 0 && !c.overdue && c.dueDate && c.dueDate.getTime() <= paydayEnd.getTime())
      .reduce((acc, c) => acc + c.pending, 0);
    if (due > 0) {
      dueThisPeriod += due;
      dueThisPeriodCustomers++;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { overdue: round(overdue), overdueCustomers, dueThisPeriod: round(dueThisPeriod), dueThisPeriodCustomers };
}
