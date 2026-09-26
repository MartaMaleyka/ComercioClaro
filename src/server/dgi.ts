import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { startOfMonth, zonedMidnight, zonedParts } from "@/lib/dates";
import { DGI_FREE_INVOICER_LIMITS } from "@/lib/country";
import type { Actor } from "./inventory";

export const DGI_PROVIDER = "dgi";

type LimitStatus = "ok" | "warning" | "exceeded";

function status(ratio: number): LimitStatus {
  if (ratio >= 1) return "exceeded";
  if (ratio >= DGI_FREE_INVOICER_LIMITS.warningRatio) return "warning";
  return "ok";
}

/**
 * Situación frente a los límites del facturador gratuito de la DGI:
 * ingresos del año calendario (B/.36,000) y documentos emitidos en el mes (100).
 */
export async function dgiFreeInvoicerStatus(business: { id: string; timezone: string }) {
  const now = new Date();
  const { year } = zonedParts(now, business.timezone);
  const yearStart = zonedMidnight(year, 1, 1, business.timezone);
  const monthStart = startOfMonth(now, business.timezone);

  const [sales, returns, documents, monthSales] = await Promise.all([
    prisma.sale.aggregate({
      where: { businessId: business.id, status: "ACTIVE", createdAt: { gte: yearStart } },
      _sum: { total: true },
    }),
    prisma.saleReturn.aggregate({
      where: { businessId: business.id, sale: { status: "ACTIVE" }, createdAt: { gte: yearStart } },
      _sum: { total: true },
    }),
    prisma.invoice.count({
      where: { businessId: business.id, provider: DGI_PROVIDER, status: "STAMPED", createdAt: { gte: monthStart } },
    }),
    prisma.sale.count({ where: { businessId: business.id, status: "ACTIVE", createdAt: { gte: monthStart } } }),
  ]);

  const revenue = money(D(sales._sum.total).minus(D(returns._sum.total))).toNumber();
  const revenueRatio = revenue / DGI_FREE_INVOICER_LIMITS.annualRevenue;
  const documentsRatio = documents / DGI_FREE_INVOICER_LIMITS.monthlyDocuments;
  const overall = [status(revenueRatio), status(documentsRatio)].includes("exceeded")
    ? "exceeded"
    : [status(revenueRatio), status(documentsRatio)].includes("warning")
      ? "warning"
      : "ok";

  // Proyección simple: ritmo de ventas del año llevado a 12 meses.
  const elapsedDays = Math.max(1, (now.getTime() - yearStart.getTime()) / 86_400_000);
  const projectedAnnualRevenue = Math.round((revenue / elapsedDays) * 365 * 100) / 100;

  return {
    year,
    limits: DGI_FREE_INVOICER_LIMITS,
    revenue,
    revenueRatio,
    documents,
    documentsRatio,
    monthSales,
    projectedAnnualRevenue,
    status: overall as LimitStatus,
  };
}

/**
 * Registra una factura emitida fuera de ComercioClaro (facturador gratuito de la DGI
 * o PAC) guardando su CUFE en la venta.
 */
export async function registerExternalInvoice(
  actor: Actor,
  input: { saleId: string; cufe: string; customerId?: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, businessId: actor.businessId } });
    if (!sale) throw notFound("Venta");
    if (sale.status !== "ACTIVE") throw new AppError(409, "No se puede facturar una venta cancelada");
    if (sale.invoiceId) throw new AppError(409, "La venta ya tiene una factura registrada");

    const duplicate = await tx.invoice.findFirst({
      where: { businessId: actor.businessId, provider: DGI_PROVIDER, uuid: input.cufe, status: "STAMPED" },
    });
    if (duplicate) throw new AppError(409, "Ese CUFE ya está registrado en otra venta");

    const invoice = await tx.invoice.create({
      data: {
        kind: "INDIVIDUAL",
        status: "STAMPED",
        provider: DGI_PROVIDER,
        uuid: input.cufe,
        total: sale.total,
        customerId: input.customerId ?? sale.customerId,
        businessId: actor.businessId,
      },
    });
    await tx.sale.update({ where: { id: sale.id }, data: { invoiceId: invoice.id } });
    await audit(tx, actor, "invoice.register", "Invoice", invoice.id, { folio: sale.folio, cufe: input.cufe });
    return invoice;
  });
}
