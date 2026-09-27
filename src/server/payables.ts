import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, sum, type Decimal } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { addDays, dayKey, dayKeysBetween } from "@/lib/dates";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { assertOpenPeriod } from "./accounting";

/**
 * Cuentas por pagar a proveedores. Las fechas de la factura y del vencimiento se guardan
 * como día calendario (medianoche UTC) y se comparan con "hoy" en la zona del negocio.
 */

export interface BillInput {
  supplierId?: string | null;
  supplierName?: string | null;
  number?: string | null;
  /** "YYYY-MM-DD"; por defecto, hoy */
  date?: string | null;
  /** "YYYY-MM-DD"; por defecto, la fecha más los días de crédito del proveedor */
  dueDate?: string | null;
  total: number;
  tax?: number | null;
  notes?: string | null;
}

export interface SupplierPaymentInput {
  amount: number;
  method: PaymentMethod;
  /** El efectivo sale de la caja abierta (entra al corte) */
  fromCash: boolean;
  reference?: string | null;
  notes?: string | null;
}

const calendarDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const keyOf = (date: Date) => date.toISOString().slice(0, 10);

/** Días de atraso de un vencimiento (0 si aún no vence). */
export function daysOverdue(dueDate: Date, todayKey: string) {
  const due = keyOf(dueDate);
  return due < todayKey ? dayKeysBetween(due, todayKey).length - 1 : 0;
}

/** Tramo de antigüedad de saldos. */
export function agingBucket(days: number): "current" | "d1_30" | "d31_60" | "d60plus" {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  return "d60plus";
}

async function businessTimezone(db: Tx | typeof prisma, businessId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  return business.timezone;
}

/** Crea la cuenta por pagar dentro de una transacción (compra a crédito o registro manual). */
export async function createBillInTx(tx: Tx, actor: Actor, input: BillInput & { purchaseId?: string | null }) {
  let supplierName = input.supplierName ?? null;
  let creditDays = 30;
  if (input.supplierId) {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, businessId: actor.businessId } });
    if (!supplier) throw notFound("Proveedor");
    supplierName = supplier.name;
    creditDays = supplier.creditDays;
  }
  if (!input.supplierId && !supplierName) throw new AppError(400, "Indica el proveedor de la factura");
  const today = dayKey(new Date(), await businessTimezone(tx, actor.businessId));
  const date = input.date ?? today;
  const due = input.dueDate ?? addDays(date, creditDays);
  if (due < date) throw new AppError(400, "El vencimiento no puede ser anterior a la fecha de la factura");
  await assertOpenPeriod(tx, actor.businessId, calendarDay(date));
  const total = money(input.total);
  const tax = money(input.tax ?? 0);
  if (tax.gt(total)) throw new AppError(400, "El impuesto no puede ser mayor al total");

  const bill = await tx.supplierBill.create({
    data: {
      number: input.number ?? null,
      supplierId: input.supplierId ?? null,
      supplierName,
      purchaseId: input.purchaseId ?? null,
      date: calendarDay(date),
      dueDate: calendarDay(due),
      total,
      tax,
      balance: total,
      notes: input.notes ?? null,
      userId: actor.userId,
      businessId: actor.businessId,
    },
  });
  await audit(tx, actor, "payable.create", "SupplierBill", bill.id, {
    total: total.toNumber(),
    supplier: supplierName,
    purchaseId: input.purchaseId ?? null,
  });
  return bill;
}

export async function createSupplierBill(actor: Actor, input: BillInput) {
  return prisma.$transaction((tx) => createBillInTx(tx, actor, input));
}

/** Abono a una factura. En efectivo de la caja exige una caja abierta. */
export async function paySupplierBill(actor: Actor, billId: string, input: SupplierPaymentInput) {
  if (input.fromCash && input.method !== "CASH") {
    throw new AppError(400, "Solo el efectivo puede salir de la caja");
  }
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "SupplierBill" WHERE "id" = ${billId} AND "businessId" = ${actor.businessId} FOR UPDATE`;
    if (rows.length === 0) throw notFound("Cuenta por pagar");
    const bill = await tx.supplierBill.findUniqueOrThrow({ where: { id: billId } });
    if (bill.status !== "OPEN") throw new AppError(409, "La factura ya no tiene saldo pendiente");
    const amount = money(input.amount);
    if (amount.gt(bill.balance)) {
      throw new AppError(400, `El abono excede el saldo pendiente (${bill.balance.toFixed(2)})`);
    }
    const cashSession = input.fromCash ? await getOpenSession(tx, actor.businessId) : null;
    if (input.fromCash && !cashSession) throw new AppError(409, "No hay una caja abierta para pagar en efectivo");

    const payment = await tx.supplierPayment.create({
      data: {
        amount,
        method: input.method,
        fromCash: input.fromCash,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        billId,
        cashSessionId: cashSession?.id ?? null,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    const balance = D(bill.balance).minus(amount);
    await tx.supplierBill.update({
      where: { id: billId },
      data: { balance, status: balance.lte(0) ? "PAID" : "OPEN" },
    });
    await audit(tx, actor, "payable.pay", "SupplierBill", billId, {
      amount: amount.toNumber(),
      method: input.method,
      fromCash: input.fromCash,
    });
    return payment;
  });
}

/**
 * Anula un abono: el saldo vuelve a la factura. Si el efectivo salió de un turno ya cerrado,
 * regresa a la caja abierta como entrada.
 */
export async function voidSupplierPayment(actor: Actor, paymentId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.findFirst({
      where: { id: paymentId, businessId: actor.businessId },
      include: { bill: true },
    });
    if (!payment) throw notFound("Abono");
    const { count } = await tx.supplierPayment.updateMany({
      where: { id: paymentId, voidedAt: null },
      data: { voidedAt: new Date(), notes: [payment.notes, `Anulado: ${reason}`].filter(Boolean).join(" · ") },
    });
    if (count === 0) throw new AppError(409, "El abono ya está anulado");
    if (payment.bill.status === "CANCELLED") throw new AppError(409, "La factura está cancelada");
    await tx.supplierBill.update({
      where: { id: payment.billId },
      data: { balance: { increment: payment.amount }, status: "OPEN" },
    });
    if (payment.fromCash) {
      const open = await getOpenSession(tx, actor.businessId);
      if (open && open.id !== payment.cashSessionId) {
        await tx.cashMovement.create({
          data: {
            type: "IN",
            amount: payment.amount,
            reason: `Abono a proveedor anulado (${payment.bill.supplierName ?? ""})`.trim(),
            source: "SUPPLIER_PAYMENT_VOID",
            cashSessionId: open.id,
            businessId: actor.businessId,
            userId: actor.userId,
          },
        });
      }
    }
    await audit(tx, actor, "payable.voidPayment", "SupplierBill", payment.billId, {
      amount: payment.amount.toNumber(),
      reason,
    });
    return tx.supplierBill.findUniqueOrThrow({ where: { id: payment.billId } });
  });
}

/** Cancela la cuenta por pagar de una compra (al cancelarse la compra). Falla si ya tiene abonos. */
export async function cancelBillForPurchase(tx: Tx, actor: Actor, purchaseId: string) {
  const bill = await tx.supplierBill.findUnique({
    where: { purchaseId },
    include: { payments: { where: { voidedAt: null } } },
  });
  if (!bill || bill.status === "CANCELLED") return;
  if (bill.payments.length > 0) {
    throw new AppError(409, "La compra ya tiene abonos al proveedor. Anúlalos antes de cancelarla.");
  }
  await tx.supplierBill.update({
    where: { id: bill.id },
    data: { status: "CANCELLED", balance: 0, cancelledAt: new Date() },
  });
}

/** Cancela una factura registrada a mano (sin abonos). */
export async function cancelSupplierBill(actor: Actor, billId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.supplierBill.findFirst({
      where: { id: billId, businessId: actor.businessId },
      include: { payments: { where: { voidedAt: null } } },
    });
    if (!bill) throw notFound("Cuenta por pagar");
    if (bill.purchaseId) throw new AppError(400, "Esta factura viene de una compra: cancela la compra");
    if (bill.status === "CANCELLED") throw new AppError(409, "La factura ya está cancelada");
    if (bill.payments.length > 0) throw new AppError(409, "La factura tiene abonos. Anúlalos antes de cancelarla.");
    await assertOpenPeriod(tx, actor.businessId, bill.date);
    const cancelled = await tx.supplierBill.update({
      where: { id: billId },
      data: {
        status: "CANCELLED",
        balance: 0,
        cancelledAt: new Date(),
        notes: [bill.notes, `Cancelada: ${reason}`].filter(Boolean).join(" · "),
      },
    });
    await audit(tx, actor, "payable.cancel", "SupplierBill", billId, { reason });
    return cancelled;
  });
}

export const billInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  purchase: { select: { id: true, folio: true } },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SupplierBillInclude;

type BillRow = Prisma.SupplierBillGetPayload<{ include: typeof billInclude }>;

function withAging(bill: BillRow, todayKey: string) {
  const days = bill.status === "OPEN" ? daysOverdue(bill.dueDate, todayKey) : 0;
  return { ...bill, daysOverdue: days, bucket: agingBucket(days) };
}

/**
 * Resumen de cuentas por pagar: facturas abiertas con su atraso, antigüedad de saldos
 * (al corriente, 1-30, 31-60, más de 60 días), lo vencido y lo que vence esta semana.
 */
export async function payablesSummary(businessId: string, timeZone: string, now = new Date()) {
  const today = dayKey(now, timeZone);
  const weekEnd = addDays(today, 7);
  const bills = await prisma.supplierBill.findMany({
    where: { businessId, status: "OPEN" },
    include: billInclude,
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
  const rows = bills.map((b) => withAging(b, today));
  const aging = { current: D(0), d1_30: D(0), d31_60: D(0), d60plus: D(0) };
  for (const b of rows) aging[b.bucket] = aging[b.bucket].plus(b.balance);
  const overdue = rows.filter((b) => b.daysOverdue > 0);
  const dueThisWeek = rows.filter((b) => b.daysOverdue === 0 && keyOf(b.dueDate) <= weekEnd);

  const bySupplier = new Map<string, { supplierId: string | null; name: string; balance: Decimal; bills: number }>();
  for (const b of rows) {
    const key = b.supplierId ?? `name:${b.supplierName ?? ""}`;
    const entry = bySupplier.get(key) ?? {
      supplierId: b.supplierId,
      name: b.supplier?.name ?? b.supplierName ?? "",
      balance: D(0),
      bills: 0,
    };
    entry.balance = entry.balance.plus(b.balance);
    entry.bills++;
    bySupplier.set(key, entry);
  }

  return {
    total: money(sum(rows.map((b) => b.balance))),
    aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, money(v)])) as Record<
      keyof typeof aging,
      Decimal
    >,
    overdue: { amount: money(sum(overdue.map((b) => b.balance))), count: overdue.length },
    dueThisWeek: { amount: money(sum(dueThisWeek.map((b) => b.balance))), count: dueThisWeek.length },
    suppliers: [...bySupplier.values()].sort((a, b) => b.balance.comparedTo(a.balance)),
    bills: rows,
  };
}

/** Facturas pagadas o canceladas recientes (historial). */
export async function closedBills(businessId: string, limit = 50) {
  return prisma.supplierBill.findMany({
    where: { businessId, status: { in: ["PAID", "CANCELLED"] } },
    include: billInclude,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

/** Estado de cuenta de un proveedor: facturas y abonos en orden, con saldo acumulado. */
export async function supplierStatement(businessId: string, supplierId: string, timeZone: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, businessId } });
  if (!supplier) throw notFound("Proveedor");
  const bills = await prisma.supplierBill.findMany({
    where: { businessId, supplierId, status: { not: "CANCELLED" } },
    include: billInclude,
    orderBy: { date: "asc" },
  });
  const today = dayKey(new Date(), timeZone);
  type Entry = { date: Date; kind: "BILL" | "PAYMENT"; description: string; charge: Decimal; payment: Decimal };
  const entries: Entry[] = [];
  for (const b of bills) {
    entries.push({
      date: b.date,
      kind: "BILL",
      description: b.number ? `Factura ${b.number}` : b.purchase ? `Compra #${b.purchase.folio}` : "Factura",
      charge: D(b.total),
      payment: D(0),
    });
    for (const p of b.payments.filter((x) => !x.voidedAt)) {
      entries.push({
        date: p.createdAt,
        kind: "PAYMENT",
        description: `Abono${b.number ? ` a factura ${b.number}` : ""}${p.reference ? ` (ref. ${p.reference})` : ""}`,
        charge: D(0),
        payment: D(p.amount),
      });
    }
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "BILL" ? -1 : 1));
  let balance = D(0);
  const lines = entries.map((e) => {
    balance = balance.plus(e.charge).minus(e.payment);
    return { ...e, balance: money(balance) };
  });
  return {
    supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, creditDays: supplier.creditDays },
    lines,
    balance: money(balance),
    open: bills.filter((b) => b.status === "OPEN").map((b) => withAging(b, today)),
  };
}

/** Lo que vence en los próximos días y lo vencido (para las alertas diarias). */
export async function payablesDueSoon(businessId: string, timeZone: string, days = 3) {
  const today = dayKey(new Date(), timeZone);
  const bills = await prisma.supplierBill.findMany({
    where: { businessId, status: "OPEN", dueDate: { lte: calendarDay(addDays(today, days)) } },
    include: { supplier: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
  return bills.map((b) => ({
    supplier: b.supplier?.name ?? b.supplierName ?? "",
    number: b.number,
    balance: b.balance,
    dueDate: b.dueDate,
    daysOverdue: daysOverdue(b.dueDate, today),
  }));
}
