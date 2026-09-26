import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { startOfDay } from "@/lib/dates";
import type { serviceSaleSchema } from "@/lib/validation";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";

export type ServiceSaleInput = z.infer<typeof serviceSaleSchema>;
export interface ServiceProvider {
  name: string;
  kind: "RECHARGE" | "BILL" | "OTHER";
  commissionRate: number;
}

/** Proveedores comunes por país; la comisión la configura cada negocio según su contrato. */
const DEFAULT_PROVIDERS: Record<string, ServiceProvider[]> = {
  PA: [
    { name: "+Móvil", kind: "RECHARGE", commissionRate: 0 },
    { name: "Tigo", kind: "RECHARGE", commissionRate: 0 },
    { name: "Digicel", kind: "RECHARGE", commissionRate: 0 },
    { name: "Naturgy", kind: "BILL", commissionRate: 0 },
    { name: "ENSA", kind: "BILL", commissionRate: 0 },
    { name: "IDAAN", kind: "BILL", commissionRate: 0 },
  ],
  MX: [
    { name: "Telcel", kind: "RECHARGE", commissionRate: 0 },
    { name: "AT&T", kind: "RECHARGE", commissionRate: 0 },
    { name: "Movistar", kind: "RECHARGE", commissionRate: 0 },
    { name: "CFE", kind: "BILL", commissionRate: 0 },
  ],
};

export function serviceProviders(business: { country: string; serviceProviders: unknown }): ServiceProvider[] {
  if (Array.isArray(business.serviceProviders)) return business.serviceProviders as ServiceProvider[];
  return DEFAULT_PROVIDERS[business.country] ?? [];
}

/** Registra una recarga o pago: el efectivo entra a la caja y la comisión se calcula con la tasa del proveedor. */
export async function createServiceSale(actor: Actor, input: ServiceSaleInput) {
  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUniqueOrThrow({
      where: { id: actor.businessId },
      select: { country: true, serviceProviders: true },
    });
    const provider = serviceProviders(business).find((p) => p.name.toLowerCase() === input.provider.toLowerCase());
    const session = await getOpenSession(tx, actor.businessId);
    if (input.paymentMethod === "CASH" && !session) {
      throw new AppError(409, "Abre la caja para cobrar en efectivo");
    }
    const amount = money(input.amount);
    const sale = await tx.serviceSale.create({
      data: {
        kind: provider?.kind ?? input.kind,
        provider: provider?.name ?? input.provider,
        reference: input.reference,
        amount,
        commission: money(amount.times(provider?.commissionRate ?? 0)),
        paymentMethod: input.paymentMethod,
        cashSessionId: session?.id ?? null,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    await audit(tx, actor, "service.create", "ServiceSale", sale.id, {
      provider: sale.provider,
      amount: amount.toNumber(),
    });
    return sale;
  });
}

/** Anula un registro; si fue en efectivo, solo mientras su turno de caja siga abierto. */
export async function cancelServiceSale(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.serviceSale.findFirst({ where: { id, businessId: actor.businessId } });
    if (!sale) throw notFound("Registro");
    // El efectivo ya contado en un corte cerrado no puede salir de la caja.
    if (sale.paymentMethod === "CASH" && sale.cashSessionId) {
      const open = await getOpenSession(tx, actor.businessId);
      if (open?.id !== sale.cashSessionId) throw new AppError(409, "El turno de caja ya se cerró; no se puede anular");
    }
    const { count } = await tx.serviceSale.updateMany({
      where: { id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (count === 0) throw new AppError(409, "El registro ya está anulado");
    await audit(tx, actor, "service.cancel", "ServiceSale", id, { provider: sale.provider });
    return tx.serviceSale.findUniqueOrThrow({ where: { id } });
  });
}

export async function listTodayServiceSales(businessId: string, timeZone: string) {
  return prisma.serviceSale.findMany({
    where: { businessId, createdAt: { gte: startOfDay(new Date(), timeZone) } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Comisiones ganadas en un rango (ingreso que no es venta de mercancía). */
export async function serviceCommissions(businessId: string, range: { start: Date; end: Date }) {
  const where: Prisma.ServiceSaleWhereInput = {
    businessId,
    status: "ACTIVE",
    createdAt: { gte: range.start, lt: range.end },
  };
  const agg = await prisma.serviceSale.aggregate({ where, _sum: { commission: true, amount: true }, _count: true });
  return { commissions: D(agg._sum.commission), collected: D(agg._sum.amount), count: agg._count };
}
