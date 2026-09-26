import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";

/** Registra un abono a la cuenta de fiado de un cliente. */
export async function addCustomerPayment(
  actor: Actor,
  customerId: string,
  input: { amount: number; method: "CASH" | "CARD" | "TRANSFER"; notes: string | null }
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
      where: { customerId, businessId, paymentMethod: "CREDIT" },
      include: { returns: { where: { refundMethod: "CREDIT" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.customerPayment.findMany({ where: { customerId, businessId }, orderBy: { createdAt: "asc" } }),
  ]);

  type Entry = { date: Date; type: "SALE" | "RETURN" | "CANCEL" | "PAYMENT"; description: string; amount: number };
  const entries: Entry[] = [];
  for (const sale of sales) {
    entries.push({ date: sale.createdAt, type: "SALE", description: `Venta #${sale.folio}`, amount: D(sale.total).toNumber() });
    for (const r of sale.returns) {
      entries.push({ date: r.createdAt, type: "RETURN", description: `Devolución venta #${sale.folio}`, amount: -D(r.total).toNumber() });
    }
    if (sale.status === "CANCELLED" && sale.cancelledAt) {
      const returned = sale.returns.reduce((acc, r) => acc.plus(r.total), D(0));
      entries.push({
        date: sale.cancelledAt,
        type: "CANCEL",
        description: `Cancelación venta #${sale.folio}`,
        amount: -D(sale.total).minus(returned).toNumber(),
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

  return { customer, entries: withBalance };
}
