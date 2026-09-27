import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { computeAging, type AgingResult } from "@/lib/aging";
import { paidWith } from "./payments";

/** Ventas con parte fiada (fiado completo o pago dividido con fiado). */
const creditSale = { payments: { some: { method: "CREDIT" as const } } };

/** Registra un abono a la cuenta de fiado de un cliente. */
export async function addCustomerPayment(
  actor: Actor,
  customerId: string,
  input: { amount: number; method: "CASH" | "CARD" | "TRANSFER" | "YAPPY"; notes: string | null }
) {
  return prisma.$transaction(async (tx) => {
    const amount = money(input.amount);
    const { count } = await tx.customer.updateMany({
      where: { id: customerId, businessId: actor.businessId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (count === 0) {
      const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: actor.businessId } });
      if (!customer) throw notFound("Cliente");
      throw new AppError(400, `El abono excede el saldo pendiente (${customer.balance.toFixed(2)})`);
    }

    const cashSession = input.method === "CASH" ? await getOpenSession(tx, actor.businessId) : null;
    const payment = await tx.customerPayment.create({
      data: {
        amount,
        method: input.method,
        notes: input.notes,
        customerId,
        businessId: actor.businessId,
        cashSessionId: cashSession?.id ?? null,
        userId: actor.userId,
      },
    });
    await audit(tx, actor, "customer.payment", "Customer", customerId, { amount: amount.toNumber() });
    return payment;
  });
}

/** Estado de cuenta: ventas fiadas, devoluciones y abonos en orden cronológico. */
export async function customerStatement(businessId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId } });
  if (!customer) throw notFound("Cliente");

  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { customerId, businessId, ...creditSale },
      include: { returns: { where: { refundMethod: "CREDIT" } }, payments: { where: { method: "CREDIT" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.customerPayment.findMany({ where: { customerId, businessId }, orderBy: { createdAt: "asc" } }),
  ]);

  type Entry = { date: Date; type: "SALE" | "RETURN" | "CANCEL" | "PAYMENT"; description: string; amount: number };
  const entries: Entry[] = [];
  for (const sale of sales) {
    const credit = paidWith(sale.payments, "CREDIT");
    entries.push({ date: sale.createdAt, type: "SALE", description: `Venta #${sale.folio}`, amount: credit.toNumber() });
    for (const r of sale.returns) {
      entries.push({ date: r.createdAt, type: "RETURN", description: `Devolución venta #${sale.folio}`, amount: -D(r.total).toNumber() });
    }
    if (sale.status === "CANCELLED" && sale.cancelledAt) {
      const returned = sale.returns.reduce((acc, r) => acc.plus(r.total), D(0));
      entries.push({
        date: sale.cancelledAt,
        type: "CANCEL",
        description: `Cancelación venta #${sale.folio}`,
        amount: -credit.minus(returned).toNumber(),
      });
    }
  }
  for (const p of payments) {
    entries.push({ date: p.createdAt, type: "PAYMENT", description: p.notes || "Abono", amount: -D(p.amount).toNumber() });
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const withBalance = entries.map((e) => {
    running = Math.round((running + e.amount) * 100) / 100;
    return { ...e, balance: running };
  });

  const aging = (await customersAging(businessId, [customerId])).get(customerId);
  return {
    customer,
    entries: withBalance,
    aging: aging
      ? {
          overdue: aging.overdue,
          daysOverdue: aging.daysOverdue,
          nextDueDate: aging.nextDueDate,
          pendingSales: aging.charges
            .filter((c) => c.pending > 0)
            .map((c) => ({ id: c.id, folio: c.folio, date: c.date, dueDate: c.dueDate, pending: c.pending, overdue: c.overdue })),
        }
      : null,
  };
}

/**
 * Antigüedad del fiado por cliente (saldo vencido, días de atraso, próximo vencimiento).
 * Las ventas anteriores a los días de crédito sin fecha de vencimiento usan fecha + días del cliente.
 */
export async function customersAging(businessId: string, customerIds?: string[]) {
  const where = { businessId, ...(customerIds ? { id: { in: customerIds } } : { balance: { gt: 0 } }) };
  const customers = await prisma.customer.findMany({ where, select: { id: true, creditDays: true } });
  if (customers.length === 0) return new Map<string, AgingResult>();
  const ids = customers.map((c) => c.id);

  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, customerId: { in: ids }, status: "ACTIVE", ...creditSale },
      select: {
        id: true,
        folio: true,
        createdAt: true,
        dueDate: true,
        customerId: true,
        payments: { where: { method: "CREDIT" }, select: { method: true, amount: true } },
        returns: { where: { refundMethod: "CREDIT" }, select: { total: true } },
      },
    }),
    prisma.customerPayment.groupBy({
      by: ["customerId"],
      where: { businessId, customerId: { in: ids } },
      _sum: { amount: true },
    }),
  ]);

  const paid = new Map(payments.map((p) => [p.customerId, Number(p._sum.amount ?? 0)]));
  const days = new Map(customers.map((c) => [c.id, c.creditDays]));
  const result = new Map<string, AgingResult>();
  for (const id of ids) {
    const charges = sales
      .filter((s) => s.customerId === id)
      .map((s) => ({
        id: s.id,
        folio: s.folio,
        date: s.createdAt,
        dueDate: s.dueDate ?? new Date(s.createdAt.getTime() + (days.get(id) ?? 15) * 86_400_000),
        amount: paidWith(s.payments, "CREDIT").toNumber() - s.returns.reduce((acc, r) => acc + Number(r.total), 0),
      }));
    result.set(id, computeAging(charges, paid.get(id) ?? 0));
  }
  return result;
}
