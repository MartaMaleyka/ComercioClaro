import { D, money, type Decimal } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey, dayRange } from "@/lib/dates";

interface Range {
  start: Date;
  end: Date;
}

/** Rango de un mes "YYYY-MM" en la zona del negocio (por defecto, el mes actual). */
export function monthRange(timeZone: string, month?: string | null) {
  const key = month ?? dayKey(new Date(), timeZone).slice(0, 7);
  const [year, m] = key.split("-").map(Number);
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  return {
    month: key,
    fromKey: `${key}-01`,
    toKey: addDays(next, -1),
    ...dayRange(`${key}-01`, addDays(next, -1), timeZone),
  };
}

type TaxRow = { taxRate: Decimal; iepsRate: Decimal; amount: Decimal | null; count?: bigint };

/**
 * Impuestos del mes para la declaración (ITBMS en Panamá, IVA/IEPS en México).
 * Los precios incluyen impuestos: base = monto / ((1 + IEPS) × (1 + tasa)).
 * El descuento general y los puntos se prorratean (factor total/subtotal de la venta).
 * Las devoluciones restan en el mes en que se hacen, como una nota de crédito.
 */
export async function taxReport(business: { id: string; timezone: string; country: string }, month?: string | null) {
  const range = monthRange(business.timezone, month);
  const [sales, returns, count] = await Promise.all([
    prisma.$queryRaw<TaxRow[]>`
      SELECT si."taxRate" AS "taxRate", si."iepsRate" AS "iepsRate",
        SUM(si."subtotal" * s."total" / NULLIF(s."subtotal", 0)) AS amount
      FROM "SaleItem" si JOIN "Sale" s ON s."id" = si."saleId"
      WHERE s."businessId" = ${business.id} AND s."status" = 'ACTIVE'
        AND s."createdAt" >= ${range.start} AND s."createdAt" < ${range.end}
      GROUP BY 1, 2`,
    prisma.$queryRaw<TaxRow[]>`
      SELECT si."taxRate" AS "taxRate", si."iepsRate" AS "iepsRate", SUM(ri."amount") AS amount
      FROM "SaleReturnItem" ri
      JOIN "SaleReturn" r ON r."id" = ri."returnId"
      JOIN "Sale" s ON s."id" = r."saleId"
      JOIN "SaleItem" si ON si."id" = ri."saleItemId"
      WHERE r."businessId" = ${business.id} AND s."status" = 'ACTIVE'
        AND r."createdAt" >= ${range.start} AND r."createdAt" < ${range.end}
      GROUP BY 1, 2`,
    prisma.sale.count({
      where: { businessId: business.id, status: "ACTIVE", createdAt: { gte: range.start, lt: range.end } },
    }),
  ]);

  const key = (r: TaxRow) => `${D(r.taxRate).toFixed(4)}|${D(r.iepsRate).toFixed(4)}`;
  const rows = new Map<string, { taxRate: Decimal; iepsRate: Decimal; sales: Decimal; returns: Decimal }>();
  for (const r of sales) {
    rows.set(key(r), { taxRate: D(r.taxRate), iepsRate: D(r.iepsRate), sales: D(r.amount), returns: D(0) });
  }
  for (const r of returns) {
    const row = rows.get(key(r)) ?? { taxRate: D(r.taxRate), iepsRate: D(r.iepsRate), sales: D(0), returns: D(0) };
    row.returns = D(r.amount);
    rows.set(key(r), row);
  }

  const lines = [...rows.values()]
    .map((r) => {
      const total = r.sales.minus(r.returns);
      const base = total.div(D(1).plus(r.iepsRate).times(D(1).plus(r.taxRate)));
      const ieps = base.times(r.iepsRate);
      return {
        taxRate: r.taxRate.toNumber(),
        iepsRate: r.iepsRate.toNumber(),
        sales: money(r.sales).toNumber(),
        returns: money(r.returns).toNumber(),
        total: money(total).toNumber(),
        base: money(base).toNumber(),
        ieps: money(ieps).toNumber(),
        tax: money(total.minus(base).minus(ieps)).toNumber(),
      };
    })
    .sort((a, b) => b.taxRate - a.taxRate || b.iepsRate - a.iepsRate);

  const totals = (["sales", "returns", "total", "base", "ieps", "tax"] as const).reduce(
    (acc, k) => ({ ...acc, [k]: money(lines.reduce((s, l) => s.plus(l[k]), D(0))).toNumber() }),
    {} as Record<"sales" | "returns" | "total" | "base" | "ieps" | "tax", number>
  );

  return {
    month: range.month,
    from: range.fromKey,
    to: range.toKey,
    taxName: business.country === "PA" ? "ITBMS" : business.country === "MX" ? "IVA" : "Impuesto",
    salesCount: count,
    lines,
    totals,
  };
}

/**
 * Desempeño por cajero en un rango: ventas, descuentos manuales (sin promociones),
 * cancelaciones hechas, devoluciones registradas y diferencias de los cortes que cerró.
 */
export async function cashierReport(businessId: string, range: Range) {
  const createdAt = { gte: range.start, lt: range.end };
  const [sales, lineDiscounts, cancellations, returns, sessions, members] = await Promise.all([
    prisma.sale.groupBy({
      by: ["userId"],
      where: { businessId, status: "ACTIVE", createdAt },
      _sum: { total: true, discount: true },
      _count: true,
    }),
    prisma.$queryRaw<{ userId: string | null; amount: Decimal | null }[]>`
      SELECT s."userId" AS "userId", SUM(si."discount" - si."promotionDiscount") AS amount
      FROM "SaleItem" si JOIN "Sale" s ON s."id" = si."saleId"
      WHERE s."businessId" = ${businessId} AND s."status" = 'ACTIVE'
        AND s."createdAt" >= ${range.start} AND s."createdAt" < ${range.end}
      GROUP BY 1`,
    prisma.auditLog.groupBy({
      by: ["userId"],
      where: { businessId, action: "sale.cancel", createdAt },
      _count: true,
    }),
    prisma.saleReturn.groupBy({
      by: ["userId"],
      where: { businessId, createdAt },
      _sum: { total: true },
      _count: true,
    }),
    prisma.cashSession.findMany({
      where: { businessId, closedAt: { gte: range.start, lt: range.end } },
      select: { closedById: true, difference: true },
    }),
    prisma.membership.findMany({ where: { businessId }, include: { user: { select: { id: true, name: true } } } }),
  ]);

  type Row = {
    userId: string;
    name: string;
    role: string | null;
    salesCount: number;
    salesTotal: Decimal;
    discounts: Decimal;
    cancellations: number;
    returnsCount: number;
    returnsTotal: Decimal;
    closings: number;
    cashDifference: Decimal;
    shortages: Decimal;
  };
  const byUser = new Map<string, Row>();
  const names = new Map(members.map((m) => [m.userId, { name: m.user.name, role: m.role }]));
  const row = (userId: string | null) => {
    const id = userId ?? "unknown";
    let r = byUser.get(id);
    if (!r) {
      r = {
        userId: id,
        name: names.get(id)?.name ?? "—",
        role: names.get(id)?.role ?? null,
        salesCount: 0,
        salesTotal: D(0),
        discounts: D(0),
        cancellations: 0,
        returnsCount: 0,
        returnsTotal: D(0),
        closings: 0,
        cashDifference: D(0),
        shortages: D(0),
      };
      byUser.set(id, r);
    }
    return r;
  };

  for (const s of sales) {
    const r = row(s.userId);
    r.salesCount = s._count;
    r.salesTotal = D(s._sum.total);
    r.discounts = r.discounts.plus(D(s._sum.discount));
  }
  for (const d of lineDiscounts) row(d.userId).discounts = row(d.userId).discounts.plus(D(d.amount));
  for (const c of cancellations) row(c.userId).cancellations = c._count;
  for (const ret of returns) {
    const r = row(ret.userId);
    r.returnsCount = ret._count;
    r.returnsTotal = D(ret._sum.total);
  }
  for (const s of sessions) {
    const r = row(s.closedById);
    const diff = D(s.difference);
    r.closings++;
    r.cashDifference = r.cashDifference.plus(diff);
    if (diff.lt(0)) r.shortages = r.shortages.plus(diff.abs());
  }

  return [...byUser.values()]
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      role: r.role,
      salesCount: r.salesCount,
      salesTotal: money(r.salesTotal).toNumber(),
      averageTicket: r.salesCount > 0 ? money(r.salesTotal.div(r.salesCount)).toNumber() : 0,
      discounts: money(r.discounts).toNumber(),
      cancellations: r.cancellations,
      returnsCount: r.returnsCount,
      returnsTotal: money(r.returnsTotal).toNumber(),
      closings: r.closings,
      cashDifference: money(r.cashDifference).toNumber(),
      shortages: money(r.shortages).toNumber(),
    }))
    .sort((a, b) => b.salesTotal - a.salesTotal);
}

/**
 * Descuentos de jubilado del mes (Ley 6 de 1987 en Panamá): cada venta con el número de
 * cédula o carné, para responder a una fiscalización de Acodeco.
 */
export async function seniorReport(business: { id: string; timezone: string }, month?: string | null) {
  const range = monthRange(business.timezone, month);
  const sales = await prisma.sale.findMany({
    where: {
      businessId: business.id,
      status: "ACTIVE",
      seniorDiscount: { gt: 0 },
      createdAt: { gte: range.start, lt: range.end },
    },
    select: {
      id: true,
      folio: true,
      createdAt: true,
      seniorId: true,
      total: true,
      seniorDiscount: true,
      userId: true,
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const userIds = [...new Set(sales.map((s) => s.userId).filter((id) => id !== null))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    month: range.month,
    count: sales.length,
    discount: money(sales.reduce((acc, s) => acc.plus(s.seniorDiscount), D(0))).toNumber(),
    total: money(sales.reduce((acc, s) => acc.plus(s.total), D(0))).toNumber(),
    sales: sales.map((s) => ({
      id: s.id,
      folio: s.folio,
      createdAt: s.createdAt,
      seniorId: s.seniorId,
      customer: s.customer?.name ?? null,
      cashier: (s.userId && names.get(s.userId)) ?? "",
      total: D(s.total).toNumber(),
      discount: D(s.seniorDiscount).toNumber(),
    })),
  };
}
