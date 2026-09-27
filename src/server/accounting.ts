import type { PaymentMethod } from "@/generated/prisma/enums";
import { AppError, notFound } from "@/lib/errors";
import { D, Decimal, money, sum, type DecimalLike } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { addDays, dayKey, dayRange } from "@/lib/dates";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { paidWith } from "./payments";

/**
 * Contabilidad generada: los asientos se derivan al consultar de las ventas, devoluciones,
 * compras, pagos, gastos y movimientos de caja. No hay doble captura.
 *
 * El inventario y el costo de ventas van sin ITBMS/IVA (el impuesto de las compras es crédito
 * fiscal): cada movimiento de inventario se valora a costo ÷ (1 + tasa del producto).
 */

// ---------- Plan de cuentas ----------

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
}

export const ACCOUNTS = {
  CASH: { code: "1101", name: "Caja", type: "ASSET" },
  BANK: { code: "1102", name: "Bancos", type: "ASSET" },
  RECEIVABLE: { code: "1103", name: "Cuentas por cobrar (fiado)", type: "ASSET" },
  INVENTORY: { code: "1104", name: "Inventario", type: "ASSET" },
  TAX_CREDIT: { code: "1105", name: "ITBMS crédito fiscal", type: "ASSET" },
  TRANSFERS: { code: "1190", name: "Traspasos entre sucursales", type: "ASSET" },
  CASH_CLEARING: { code: "1199", name: "Movimientos de caja por clasificar", type: "ASSET" },
  PAYABLE: { code: "2101", name: "Cuentas por pagar (proveedores)", type: "LIABILITY" },
  TAX_PAYABLE: { code: "2102", name: "ITBMS por pagar", type: "LIABILITY" },
  GIFT_CARDS: { code: "2103", name: "Vales por canjear", type: "LIABILITY" },
  THIRD_PARTY: { code: "2104", name: "Cobros por cuenta de terceros", type: "LIABILITY" },
  CAPITAL: { code: "3101", name: "Capital", type: "EQUITY" },
  DRAWINGS: { code: "3102", name: "Retiros del dueño", type: "EQUITY" },
  SALES: { code: "4101", name: "Ventas", type: "INCOME" },
  OTHER_INCOME: { code: "4103", name: "Otros ingresos", type: "INCOME" },
  COGS: { code: "5101", name: "Costo de ventas", type: "EXPENSE" },
  SHRINKAGE: { code: "6180", name: "Mermas y ajustes de inventario", type: "EXPENSE" },
  CASH_DIFF: { code: "6190", name: "Faltantes y sobrantes de caja", type: "EXPENSE" },
} satisfies Record<string, Account>;

/** Cuenta de gasto por categoría ("61-renta"). */
export function expenseAccount(category: string): Account {
  const slug = category
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { code: `61-${slug || "otros"}`, name: `Gastos: ${category}`, type: "EXPENSE" };
}

/** Cuenta donde entra o sale el dinero según la forma de pago. */
export function paymentAccount(method: PaymentMethod | string): Account {
  if (method === "CASH") return ACCOUNTS.CASH;
  if (method === "CREDIT") return ACCOUNTS.RECEIVABLE;
  if (method === "GIFT_CARD") return ACCOUNTS.GIFT_CARDS;
  return ACCOUNTS.BANK;
}

// ---------- Asientos ----------

export interface JournalLine {
  account: Account;
  debit: Decimal;
  credit: Decimal;
}

export interface JournalEntry {
  date: Date;
  /** Origen: SALE, RETURN, PURCHASE, EXPENSE, OWNER... (clasifica el flujo de efectivo) */
  kind: string;
  reference: string;
  description: string;
  lines: JournalLine[];
}

class EntryBuilder {
  lines: JournalLine[] = [];
  debit(account: Account, amount: DecimalLike) {
    const value = money(amount);
    if (value.gt(0)) this.lines.push({ account, debit: value, credit: D(0) });
    else if (value.lt(0)) this.lines.push({ account, debit: D(0), credit: value.neg() });
    return this;
  }
  credit(account: Account, amount: DecimalLike) {
    return this.debit(account, money(amount).neg());
  }
}

function entry(
  date: Date,
  kind: string,
  reference: string,
  description: string,
  build: (e: EntryBuilder) => void
): JournalEntry | null {
  const builder = new EntryBuilder();
  build(builder);
  if (builder.lines.length === 0) return null;
  // Cuadra centavos de redondeo contra la primera cuenta de resultados o la última línea.
  const diff = sum(builder.lines.map((l) => l.debit.minus(l.credit)));
  if (!diff.isZero()) {
    const target =
      builder.lines.find((l) => l.account.type === "INCOME" || l.account.type === "EXPENSE") ??
      builder.lines[builder.lines.length - 1];
    if (target.credit.gt(0)) target.credit = target.credit.plus(diff);
    else target.debit = target.debit.minus(diff);
  }
  return { date, kind, reference, description, lines: builder.lines };
}

/** Impuesto incluido en un monto con su tasa (e IEPS en México). */
function includedTax(amount: DecimalLike, taxRate: DecimalLike, iepsRate: DecimalLike = 0) {
  const total = D(amount);
  return total.minus(
    total.div(
      D(1)
        .plus(D(iepsRate))
        .times(D(1).plus(D(taxRate)))
    )
  );
}

/**
 * Todos los asientos del negocio con fecha anterior a `until`. El libro diario, el mayor
 * y los estados financieros se calculan sobre esta lista.
 */
export async function buildJournal(businessId: string, until: Date): Promise<JournalEntry[]> {
  const before = { lt: until };
  const [
    sales,
    returns,
    movements,
    purchases,
    customerPayments,
    giftCardMoves,
    expenses,
    cashMovements,
    sessions,
    services,
    supplierPayments,
    manualBills,
    ownerTransactions,
  ] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, OR: [{ createdAt: before }, { cancelledAt: before }] },
      include: {
        items: { select: { subtotal: true, taxRate: true, iepsRate: true } },
        payments: { select: { method: true, amount: true } },
        returns: {
          select: {
            total: true,
            refundMethod: true,
            items: { select: { amount: true, saleItem: { select: { taxRate: true, iepsRate: true } } } },
          },
        },
      },
    }),
    prisma.saleReturn.findMany({
      where: { businessId, createdAt: before },
      include: {
        sale: { select: { folio: true } },
        items: { select: { amount: true, saleItem: { select: { taxRate: true, iepsRate: true } } } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { businessId, createdAt: before, type: { notIn: ["PURCHASE", "PURCHASE_CANCEL"] } },
      select: {
        type: true,
        quantity: true,
        unitCost: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true, taxRate: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { businessId, OR: [{ createdAt: before }, { cancelledAt: before }] },
      select: {
        folio: true,
        total: true,
        tax: true,
        paidFromCash: true,
        onCredit: true,
        status: true,
        createdAt: true,
        cancelledAt: true,
        supplierName: true,
      },
    }),
    prisma.customerPayment.findMany({
      where: { businessId, createdAt: before },
      include: { customer: { select: { name: true } } },
    }),
    prisma.giftCardTransaction.findMany({
      where: { businessId, createdAt: before, type: { in: ["ISSUE", "VOID"] } },
    }),
    prisma.expense.findMany({ where: { businessId, date: before } }),
    prisma.cashMovement.findMany({ where: { businessId, createdAt: before, source: null } }),
    prisma.cashSession.findMany({
      where: { businessId, openedAt: before },
      select: { openedAt: true, openingAmount: true, closedAt: true, countedAmount: true, difference: true },
      orderBy: { openedAt: "asc" },
    }),
    prisma.serviceSale.findMany({ where: { businessId, OR: [{ createdAt: before }, { cancelledAt: before }] } }),
    prisma.supplierPayment.findMany({
      where: { businessId, OR: [{ createdAt: before }, { voidedAt: before }] },
      include: { bill: { select: { number: true, supplierName: true } } },
    }),
    prisma.supplierBill.findMany({
      where: { businessId, purchaseId: null, OR: [{ date: before }, { cancelledAt: before }] },
    }),
    prisma.ownerTransaction.findMany({ where: { businessId, date: before } }),
  ]);

  const entries: (JournalEntry | null)[] = [];
  const inRange = (date: Date | null | undefined): date is Date => Boolean(date && date < until);

  for (const sale of sales) {
    const factor = D(sale.subtotal).gt(0) ? D(sale.total).div(sale.subtotal) : D(0);
    const saleTax = money(sum(sale.items.map((i) => includedTax(D(i.subtotal).times(factor), i.taxRate, i.iepsRate))));
    const ref = `Venta #${sale.folio}`;
    if (inRange(sale.createdAt)) {
      entries.push(
        entry(sale.createdAt, "SALE", ref, "Venta", (e) => {
          for (const p of sale.payments) e.debit(paymentAccount(p.method), p.amount);
          e.credit(ACCOUNTS.SALES, D(sale.total).minus(saleTax));
          e.credit(ACCOUNTS.TAX_PAYABLE, saleTax);
        })
      );
    }
    if (sale.status === "CANCELLED" && inRange(sale.cancelledAt)) {
      // Se revierte lo que no se había devuelto, por la misma forma en que se cobró.
      const returnedTax = sum(
        sale.returns.flatMap((r) => r.items.map((i) => includedTax(i.amount, i.saleItem.taxRate, i.saleItem.iepsRate)))
      );
      const left = (method: string) =>
        paidWith(sale.payments, method).minus(
          sum(sale.returns.filter((r) => r.refundMethod === method).map((r) => r.total))
        );
      const moneyLeft = sum(["CASH", "CARD", "TRANSFER", "YAPPY"].map(left));
      const cashLeft = Decimal.min(left("CASH"), moneyLeft);
      const remaining = D(sale.total).minus(sum(sale.returns.map((r) => r.total)));
      const remainingTax = money(saleTax.minus(returnedTax));
      entries.push(
        entry(sale.cancelledAt, "SALE", ref, "Cancelación de venta", (e) => {
          e.debit(ACCOUNTS.SALES, remaining.minus(remainingTax));
          e.debit(ACCOUNTS.TAX_PAYABLE, remainingTax);
          e.credit(ACCOUNTS.RECEIVABLE, Decimal.max(left("CREDIT"), 0));
          e.credit(ACCOUNTS.GIFT_CARDS, Decimal.max(left("GIFT_CARD"), 0));
          e.credit(ACCOUNTS.CASH, Decimal.max(cashLeft, 0));
          e.credit(ACCOUNTS.BANK, Decimal.max(moneyLeft.minus(Decimal.max(cashLeft, 0)), 0));
        })
      );
    }
  }

  for (const r of returns) {
    const tax = money(sum(r.items.map((i) => includedTax(i.amount, i.saleItem.taxRate, i.saleItem.iepsRate))));
    entries.push(
      entry(r.createdAt, "SALE", `Venta #${r.sale.folio}`, "Devolución", (e) => {
        e.debit(ACCOUNTS.SALES, D(r.total).minus(tax));
        e.debit(ACCOUNTS.TAX_PAYABLE, tax);
        e.credit(paymentAccount(r.refundMethod), r.total);
      })
    );
  }

  // Inventario: cada movimiento a costo sin impuesto (las compras se registran con su factura).
  for (const m of movements) {
    const value = money(
      D(m.quantity)
        .times(D(m.unitCost))
        .div(D(1).plus(D(m.product.taxRate)))
    );
    if (value.isZero()) continue;
    const counterpart =
      m.type === "SALE" || m.type === "SALE_CANCEL" || m.type === "SALE_RETURN"
        ? ACCOUNTS.COGS
        : m.type === "INITIAL"
          ? ACCOUNTS.CAPITAL
          : m.type === "TRANSFER_IN" || m.type === "TRANSFER_OUT"
            ? ACCOUNTS.TRANSFERS
            : ACCOUNTS.SHRINKAGE;
    const description =
      m.type === "INITIAL"
        ? "Existencia inicial"
        : counterpart === ACCOUNTS.COGS
          ? "Costo de lo vendido"
          : counterpart === ACCOUNTS.TRANSFERS
            ? "Traspaso entre sucursales"
            : "Ajuste de inventario";
    entries.push(
      entry(m.createdAt, m.type === "INITIAL" ? "INITIAL" : "INVENTORY", m.product.name, description, (e) => {
        e.debit(ACCOUNTS.INVENTORY, value);
        e.credit(counterpart, value);
      })
    );
  }

  for (const p of purchases) {
    const payTo = p.onCredit ? ACCOUNTS.PAYABLE : p.paidFromCash ? ACCOUNTS.CASH : ACCOUNTS.BANK;
    const post = (date: Date, description: string, sign: 1 | -1) =>
      entry(date, "PURCHASE", `Compra #${p.folio}`, description, (e) => {
        e.debit(ACCOUNTS.INVENTORY, D(p.total).minus(p.tax).times(sign));
        e.debit(ACCOUNTS.TAX_CREDIT, D(p.tax).times(sign));
        e.credit(payTo, D(p.total).times(sign));
      });
    if (inRange(p.createdAt))
      entries.push(post(p.createdAt, `Compra${p.supplierName ? ` a ${p.supplierName}` : ""}`, 1));
    if (p.status === "CANCELLED" && inRange(p.cancelledAt))
      entries.push(post(p.cancelledAt, "Cancelación de compra", -1));
  }

  for (const p of customerPayments) {
    entries.push(
      entry(p.createdAt, "COLLECTION", p.customer.name, "Abono de fiado", (e) => {
        e.debit(paymentAccount(p.method), p.amount);
        e.credit(ACCOUNTS.RECEIVABLE, p.amount);
      })
    );
  }

  for (const g of giftCardMoves) {
    entries.push(
      g.type === "ISSUE"
        ? entry(g.createdAt, "GIFT_CARD", "Vale", "Venta de vale", (e) => {
            e.debit(paymentAccount(g.paymentMethod ?? "CASH"), g.amount);
            e.credit(ACCOUNTS.GIFT_CARDS, g.amount);
          })
        : entry(g.createdAt, "GIFT_CARD", "Vale", "Vale anulado (saldo no usado)", (e) => {
            e.debit(ACCOUNTS.GIFT_CARDS, D(g.amount).abs());
            e.credit(ACCOUNTS.OTHER_INCOME, D(g.amount).abs());
          })
    );
  }

  for (const x of expenses) {
    entries.push(
      entry(x.date, "EXPENSE", x.category, x.description ?? "Gasto", (e) => {
        e.debit(expenseAccount(x.category), x.amount);
        e.credit(paymentAccount(x.paymentMethod), x.amount);
      })
    );
  }

  for (const m of cashMovements) {
    entries.push(
      entry(m.createdAt, "CASH_MOVEMENT", "Caja", m.reason, (e) => {
        const amount = D(m.amount).times(m.type === "IN" ? 1 : -1);
        e.debit(ACCOUNTS.CASH, amount);
        e.credit(ACCOUNTS.CASH_CLEARING, amount);
      })
    );
  }

  // Fondo de cada turno: lo que se agrega o se retira respecto a lo contado en el corte anterior.
  let lastCounted = D(0);
  for (const s of sessions) {
    const added = D(s.openingAmount).minus(lastCounted);
    entries.push(
      entry(s.openedAt, "CASH_MOVEMENT", "Apertura de caja", "Fondo inicial del turno", (e) => {
        e.debit(ACCOUNTS.CASH, added);
        e.credit(ACCOUNTS.CASH_CLEARING, added);
      })
    );
    if (inRange(s.closedAt) && s.difference && !D(s.difference).isZero()) {
      entries.push(
        entry(s.closedAt, "CASH_MOVEMENT", "Corte de caja", "Diferencia del corte", (e) => {
          e.debit(ACCOUNTS.CASH, D(s.difference));
          e.credit(ACCOUNTS.CASH_DIFF, D(s.difference));
        })
      );
    }
    if (inRange(s.closedAt)) lastCounted = D(s.countedAmount);
  }

  for (const s of services) {
    const post = (date: Date, description: string, sign: 1 | -1) =>
      entry(date, "SERVICE", s.provider, description, (e) => {
        e.debit(paymentAccount(s.paymentMethod), D(s.amount).times(sign));
        e.credit(ACCOUNTS.THIRD_PARTY, D(s.amount).minus(s.commission).times(sign));
        e.credit(ACCOUNTS.OTHER_INCOME, D(s.commission).times(sign));
      });
    if (inRange(s.createdAt)) entries.push(post(s.createdAt, "Recarga o pago de servicio", 1));
    if (s.status === "CANCELLED" && inRange(s.cancelledAt)) entries.push(post(s.cancelledAt, "Servicio anulado", -1));
  }

  for (const p of supplierPayments) {
    const ref = p.bill.supplierName ?? "Proveedor";
    const account = p.fromCash ? ACCOUNTS.CASH : paymentAccount(p.method === "CASH" ? "TRANSFER" : p.method);
    // El efectivo que no salió de la caja salió del bolsillo o del banco: se registra en Bancos.
    const post = (date: Date, description: string, sign: 1 | -1) =>
      entry(date, "SUPPLIER_PAYMENT", ref, description, (e) => {
        e.debit(ACCOUNTS.PAYABLE, D(p.amount).times(sign));
        e.credit(account, D(p.amount).times(sign));
      });
    if (inRange(p.createdAt))
      entries.push(post(p.createdAt, `Abono${p.bill.number ? ` a factura ${p.bill.number}` : ""}`, 1));
    if (inRange(p.voidedAt)) entries.push(post(p.voidedAt, "Abono anulado", -1));
  }

  for (const b of manualBills) {
    const post = (date: Date, description: string, sign: 1 | -1) =>
      entry(date, "PURCHASE", b.supplierName ?? "Proveedor", description, (e) => {
        e.debit(expenseAccount("Facturas de proveedores"), D(b.total).minus(b.tax).times(sign));
        e.debit(ACCOUNTS.TAX_CREDIT, D(b.tax).times(sign));
        e.credit(ACCOUNTS.PAYABLE, D(b.total).times(sign));
      });
    if (inRange(b.date)) entries.push(post(b.date, `Factura${b.number ? ` ${b.number}` : ""} registrada a mano`, 1));
    if (b.status === "CANCELLED" && inRange(b.cancelledAt)) entries.push(post(b.cancelledAt, "Factura cancelada", -1));
  }

  for (const o of ownerTransactions) {
    entries.push(
      o.type === "CONTRIBUTION"
        ? entry(o.date, "OWNER", "Dueño", o.notes ?? "Aporte del dueño", (e) => {
            e.debit(paymentAccount(o.method), o.amount);
            e.credit(ACCOUNTS.CAPITAL, o.amount);
          })
        : entry(o.date, "OWNER", "Dueño", o.notes ?? "Retiro del dueño", (e) => {
            e.debit(ACCOUNTS.DRAWINGS, o.amount);
            e.credit(paymentAccount(o.method), o.amount);
          })
    );
  }

  return entries.filter((e): e is JournalEntry => e !== null).sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------- Mayor y estados financieros ----------

interface Balance {
  account: Account;
  debit: Decimal;
  credit: Decimal;
}

function balances(entries: JournalEntry[]) {
  const map = new Map<string, Balance>();
  for (const e of entries) {
    for (const l of e.lines) {
      const b = map.get(l.account.code) ?? { account: l.account, debit: D(0), credit: D(0) };
      b.debit = b.debit.plus(l.debit);
      b.credit = b.credit.plus(l.credit);
      map.set(l.account.code, b);
    }
  }
  return [...map.values()].sort((a, b) => a.account.code.localeCompare(b.account.code));
}

/** Saldo con el signo natural de la cuenta (deudor para activo y gasto, acreedor para lo demás). */
export function naturalBalance(b: { account: Account; debit: Decimal; credit: Decimal }) {
  const debitNature = b.account.type === "ASSET" || b.account.type === "EXPENSE";
  return money(debitNature ? b.debit.minus(b.credit) : b.credit.minus(b.debit));
}

function period(timeZone: string, fromKey: string, toKey: string) {
  return { fromKey, toKey, ...dayRange(fromKey, toKey, timeZone) };
}

/** Estado de resultados de un periodo. */
export function incomeStatement(entries: JournalEntry[]) {
  const rows = balances(entries).filter((b) => b.account.type === "INCOME" || b.account.type === "EXPENSE");
  const pick = (code: string) => rows.find((r) => r.account.code === code);
  const sales = pick(ACCOUNTS.SALES.code) ? naturalBalance(pick(ACCOUNTS.SALES.code)!) : D(0);
  const cogs = pick(ACCOUNTS.COGS.code) ? naturalBalance(pick(ACCOUNTS.COGS.code)!) : D(0);
  const otherIncome = sum(
    rows.filter((r) => r.account.type === "INCOME" && r.account.code !== ACCOUNTS.SALES.code).map(naturalBalance)
  );
  const expenses = rows
    .filter((r) => r.account.type === "EXPENSE" && r.account.code !== ACCOUNTS.COGS.code)
    .map((r) => ({ code: r.account.code, name: r.account.name, amount: naturalBalance(r) }))
    .filter((r) => !r.amount.isZero());
  const grossProfit = sales.minus(cogs);
  const totalExpenses = sum(expenses.map((e) => e.amount));
  return {
    sales: money(sales),
    cogs: money(cogs),
    grossProfit: money(grossProfit),
    otherIncome: money(otherIncome),
    expenses,
    totalExpenses: money(totalExpenses),
    netIncome: money(grossProfit.plus(otherIncome).minus(totalExpenses)),
  };
}

/** Balance general a una fecha: el resultado acumulado entra al patrimonio. */
export function balanceSheet(entries: JournalEntry[]) {
  const rows = balances(entries);
  const section = (type: AccountType) =>
    rows
      .filter((r) => r.account.type === type)
      .map((r) => ({ code: r.account.code, name: r.account.name, amount: naturalBalance(r) }))
      .filter((r) => !r.amount.isZero());
  const assets = section("ASSET");
  const liabilities = section("LIABILITY");
  // Los retiros quedan en negativo: restan del patrimonio.
  const equity = section("EQUITY");
  const result = incomeStatement(entries).netIncome;
  const totalAssets = money(sum(assets.map((a) => a.amount)));
  const totalLiabilities = money(sum(liabilities.map((a) => a.amount)));
  const totalEquity = money(sum(equity.map((a) => a.amount)).plus(result));
  return {
    assets,
    liabilities,
    equity,
    result,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets.eq(totalLiabilities.plus(totalEquity)),
  };
}

const CASH_CODES = [ACCOUNTS.CASH.code, ACCOUNTS.BANK.code];
const CASH_FLOW_LABELS: Record<string, string> = {
  SALE: "Ventas y devoluciones",
  COLLECTION: "Cobros de fiado",
  PURCHASE: "Compras de contado",
  SUPPLIER_PAYMENT: "Pagos a proveedores",
  EXPENSE: "Gastos",
  PAYROLL: "Planilla",
  SERVICE: "Recargas y servicios",
  GIFT_CARD: "Venta de vales",
  CASH_MOVEMENT: "Movimientos de caja",
  OWNER: "Aportes y retiros del dueño",
};

/** Flujo de efectivo (método directo): cambio de Caja + Bancos por origen. */
export function cashFlowStatement(before: JournalEntry[], during: JournalEntry[]) {
  const cashOf = (list: JournalEntry[]) =>
    sum(
      list.flatMap((e) =>
        e.lines.filter((l) => CASH_CODES.includes(l.account.code)).map((l) => l.debit.minus(l.credit))
      )
    );
  const byKind = new Map<string, Decimal>();
  for (const e of during) {
    const delta = sum(e.lines.filter((l) => CASH_CODES.includes(l.account.code)).map((l) => l.debit.minus(l.credit)));
    if (delta.isZero()) continue;
    byKind.set(e.kind, (byKind.get(e.kind) ?? D(0)).plus(delta));
  }
  const lines = [...byKind.entries()].map(([kind, amount]) => ({
    kind,
    label: CASH_FLOW_LABELS[kind] ?? kind,
    activity: kind === "OWNER" ? "FINANCING" : "OPERATING",
    amount: money(amount),
  }));
  const opening = money(cashOf(before));
  const change = money(sum(lines.map((l) => l.amount)));
  return {
    opening,
    operating: lines.filter((l) => l.activity === "OPERATING"),
    financing: lines.filter((l) => l.activity === "FINANCING"),
    change,
    closing: money(opening.plus(change)),
  };
}

/** Estados financieros de un periodo (fechas locales, inclusivas). */
export async function financialStatements(business: { id: string; timezone: string }, fromKey: string, toKey: string) {
  const range = period(business.timezone, fromKey, toKey);
  const all = await buildJournal(business.id, range.end);
  const before = all.filter((e) => e.date < range.start);
  const during = all.filter((e) => e.date >= range.start);
  return {
    from: fromKey,
    to: toKey,
    income: incomeStatement(during),
    balance: balanceSheet(all),
    cashFlow: cashFlowStatement(before, during),
  };
}

/** Libro diario del periodo. */
export async function journal(business: { id: string; timezone: string }, fromKey: string, toKey: string) {
  const range = period(business.timezone, fromKey, toKey);
  const all = await buildJournal(business.id, range.end);
  return all.filter((e) => e.date >= range.start);
}

/** Libro mayor del periodo: por cuenta, saldo inicial, movimientos y saldo final. */
export async function ledger(business: { id: string; timezone: string }, fromKey: string, toKey: string) {
  const range = period(business.timezone, fromKey, toKey);
  const all = await buildJournal(business.id, range.end);
  const opening = new Map(
    balances(all.filter((e) => e.date < range.start)).map((b) => [b.account.code, naturalBalance(b)])
  );
  const accounts = new Map<
    string,
    {
      account: Account;
      lines: { date: Date; reference: string; description: string; debit: Decimal; credit: Decimal }[];
    }
  >();
  for (const e of all.filter((x) => x.date >= range.start)) {
    for (const l of e.lines) {
      const a = accounts.get(l.account.code) ?? { account: l.account, lines: [] };
      a.lines.push({
        date: e.date,
        reference: e.reference,
        description: e.description,
        debit: l.debit,
        credit: l.credit,
      });
      accounts.set(l.account.code, a);
    }
  }
  for (const code of opening.keys()) {
    if (!accounts.has(code)) {
      const account = balances(all).find((b) => b.account.code === code)!.account;
      accounts.set(code, { account, lines: [] });
    }
  }
  return [...accounts.values()]
    .sort((a, b) => a.account.code.localeCompare(b.account.code))
    .map(({ account, lines }) => {
      const debitNature = account.type === "ASSET" || account.type === "EXPENSE";
      let running = opening.get(account.code) ?? D(0);
      const start = running;
      const rows = lines.map((l) => {
        running = running.plus(debitNature ? l.debit.minus(l.credit) : l.credit.minus(l.debit));
        return { ...l, balance: money(running) };
      });
      return {
        code: account.code,
        name: account.name,
        type: account.type,
        opening: money(start),
        debit: money(sum(lines.map((l) => l.debit))),
        credit: money(sum(lines.map((l) => l.credit))),
        closing: money(running),
        lines: rows,
      };
    });
}

// ---------- Aportes y retiros del dueño ----------

export interface OwnerTransactionInput {
  type: "CONTRIBUTION" | "WITHDRAWAL";
  amount: number;
  method: "CASH" | "CARD" | "TRANSFER" | "YAPPY";
  date?: Date | null;
  notes?: string | null;
}

/** Aporte o retiro del dueño. En efectivo entra o sale de la caja abierta. */
export async function createOwnerTransaction(actor: Actor, input: OwnerTransactionInput) {
  return prisma.$transaction(async (tx) => {
    const date = input.date ?? new Date();
    await assertOpenPeriod(tx, actor.businessId, date);
    const amount = money(input.amount);
    const session = input.method === "CASH" ? await getOpenSession(tx, actor.businessId) : null;
    if (input.method === "CASH" && !session) throw new AppError(409, "Abre la caja para registrar efectivo");
    const created = await tx.ownerTransaction.create({
      data: {
        type: input.type,
        amount,
        method: input.method,
        date,
        notes: input.notes ?? null,
        cashSessionId: session?.id ?? null,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    if (session) {
      await tx.cashMovement.create({
        data: {
          type: input.type === "CONTRIBUTION" ? "IN" : "OUT",
          amount,
          reason: input.type === "CONTRIBUTION" ? "Aporte del dueño" : "Retiro del dueño",
          source: "OWNER",
          cashSessionId: session.id,
          businessId: actor.businessId,
          userId: actor.userId,
        },
      });
    }
    await audit(
      tx,
      actor,
      `owner.${input.type === "CONTRIBUTION" ? "contribution" : "withdrawal"}`,
      "OwnerTransaction",
      created.id,
      {
        amount: amount.toNumber(),
        method: input.method,
      }
    );
    return created;
  });
}

export async function listOwnerTransactions(businessId: string) {
  return prisma.ownerTransaction.findMany({ where: { businessId }, orderBy: { date: "desc" }, take: 200 });
}

// ---------- Cierre de mes ----------

/** Mes "YYYY-MM" de una fecha en la zona del negocio. */
function monthOf(date: Date, timeZone: string) {
  return dayKey(date, timeZone).slice(0, 7);
}

/**
 * Falla si la fecha cae en un mes cerrado. Se usa al registrar, cancelar o editar
 * ventas, compras y gastos.
 */
export async function assertOpenPeriod(db: Tx | typeof prisma, businessId: string, date: Date) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
  const month = monthOf(date, business.timezone);
  const closed = await db.accountingPeriod.findFirst({ where: { businessId, month, closedAt: { not: null } } });
  if (closed) {
    throw new AppError(
      409,
      `El mes ${month} está cerrado en contabilidad. Pide al dueño que lo reabra para cambiarlo.`
    );
  }
}

/** ¿La fecha cae en un mes cerrado? */
export async function isClosedPeriod(db: Tx | typeof prisma, businessId: string, date: Date) {
  try {
    await assertOpenPeriod(db, businessId, date);
    return false;
  } catch (err) {
    if (err instanceof AppError) return true;
    throw err;
  }
}

export async function listPeriods(business: { id: string; timezone: string }) {
  const periods = await prisma.accountingPeriod.findMany({
    where: { businessId: business.id },
    orderBy: { month: "desc" },
  });
  const current = dayKey(new Date(), business.timezone).slice(0, 7);
  // Los últimos 12 meses, cerrados o no.
  const months: string[] = [];
  let [y, m] = current.split("-").map(Number);
  for (let i = 0; i < 12; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  const byMonth = new Map(periods.map((p) => [p.month, p]));
  return months.map((month) => ({
    month,
    current: month === current,
    closedAt: byMonth.get(month)?.closedAt ?? null,
    reopenedAt: byMonth.get(month)?.reopenedAt ?? null,
  }));
}

export async function closePeriod(actor: Actor & { timezone: string }, month: string) {
  const current = dayKey(new Date(), actor.timezone).slice(0, 7);
  if (month > current) throw new AppError(400, "No se puede cerrar un mes que no ha empezado");
  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.upsert({
      where: { businessId_month: { businessId: actor.businessId, month } },
      create: { businessId: actor.businessId, month, closedAt: new Date(), closedById: actor.userId },
      update: { closedAt: new Date(), closedById: actor.userId },
    });
    await audit(tx, actor, "period.close", "AccountingPeriod", period.id, { month });
    return period;
  });
}

export async function reopenPeriod(actor: Actor, month: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.accountingPeriod.findUnique({
      where: { businessId_month: { businessId: actor.businessId, month } },
    });
    if (!period?.closedAt) throw notFound("Mes cerrado");
    const reopened = await tx.accountingPeriod.update({
      where: { id: period.id },
      data: { closedAt: null, reopenedAt: new Date() },
    });
    await audit(tx, actor, "period.reopen", "AccountingPeriod", period.id, { month, reason });
    return reopened;
  });
}

/** Rango "YYYY-MM-01".."último día" de un mes. */
export function monthKeys(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { fromKey: `${month}-01`, toKey: addDays(next, -1) };
}
