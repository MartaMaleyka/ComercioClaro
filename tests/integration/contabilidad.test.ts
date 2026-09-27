import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { D, sum } from "@/lib/decimal";
import { dayKey } from "@/lib/dates";
import { cancelSale, createSale, returnSale } from "@/server/sales";
import { cancelPurchase, createPurchase } from "@/server/purchases";
import { addCashMovement, cashSessionSummary, closeCashSession, openCashSession } from "@/server/cash";
import { addCustomerPayment } from "@/server/customers";
import { issueGiftCard } from "@/server/gift-cards";
import { createServiceSale } from "@/server/services";
import { adjustStock } from "@/server/inventory";
import { paySupplierBill, voidSupplierPayment } from "@/server/payables";
import { taxReport } from "@/server/insights";
import {
  ACCOUNTS,
  buildJournal,
  closePeriod,
  createOwnerTransaction,
  financialStatements,
  journal,
  ledger,
  monthKeys,
  reopenPeriod,
} from "@/server/accounting";
import { booksSpreadsheet, journalCsv } from "@/server/accounting-export";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const TZ = "America/Panama";
const month = () => dayKey(new Date(), TZ).slice(0, 7);

describe.skipIf(!hasDatabase)("contabilidad automática", () => {
  beforeEach(resetDatabase);

  async function panama() {
    const owner = await createOwner();
    await prisma.business.update({
      where: { id: owner.businessId },
      data: {
        country: "PA",
        timezone: TZ,
        serviceProviders: [{ name: "Tigo", kind: "RECHARGE", commissionRate: 0.05 }],
      },
    });
    return owner;
  }

  /** Un mes con todo tipo de operaciones. */
  async function busyMonth() {
    const owner = await panama();
    const soda = await makeProduct(owner, { name: "Soda", price: 1.07, cost: 0.535, taxRate: 0.07, stock: 20 });
    const rice = await makeProduct(owner, { name: "Arroz", price: 2, cost: 1.2, taxRate: 0, stock: 30 });
    const customer = await prisma.customer.create({ data: { name: "Maritza", businessId: owner.businessId } });
    const supplier = await prisma.supplier.create({ data: { name: "Istmo", businessId: owner.businessId } });
    await openCashSession(owner, { openingAmount: 50, notes: null });
    await createOwnerTransaction(owner, {
      type: "CONTRIBUTION",
      amount: 500,
      method: "TRANSFER",
      notes: "Capital inicial",
    });

    const credit = await createPurchase(owner, {
      supplierId: supplier.id,
      supplierName: null,
      notes: null,
      paidFromCash: false,
      onCredit: true,
      items: [{ productId: soda.id, quantity: 10, unitCost: 0.535, lotCode: null, expiresAt: null }],
    });
    await createPurchase(owner, {
      supplierId: null,
      supplierName: "Mercado",
      notes: null,
      paidFromCash: true,
      items: [{ productId: rice.id, quantity: 5, unitCost: 1.2, lotCode: null, expiresAt: null }],
    });
    const bill = await prisma.supplierBill.findUniqueOrThrow({ where: { purchaseId: credit.id } });
    const payment = await paySupplierBill(owner, bill.id, { amount: 2, method: "TRANSFER", fromCash: false });
    await paySupplierBill(owner, bill.id, { amount: 1, method: "CASH", fromCash: true });
    await voidSupplierPayment(owner, payment.id, "Duplicado");

    await createSale(
      owner,
      saleInput([
        { productId: soda.id, quantity: 3 },
        { productId: rice.id, quantity: 2 },
      ])
    );
    const mixed = await createSale(
      owner,
      saleInput([{ productId: rice.id, quantity: 5 }], {
        customerId: customer.id,
        payments: [
          { method: "CREDIT", amount: 4 },
          { method: "CARD", amount: 6 },
        ],
      })
    );
    await returnSale(owner, mixed.id, {
      items: [{ saleItemId: mixed.items[0].id, quantity: 1 }],
      reason: null,
      refundMethod: "CREDIT",
    });
    const cancelled = await createSale(
      owner,
      saleInput([{ productId: soda.id, quantity: 2 }], { paymentMethod: "YAPPY" })
    );
    await cancelSale(owner, cancelled.id, "Error");
    await addCustomerPayment(owner, customer.id, { amount: 2, method: "CASH", notes: null });

    const card = await issueGiftCard(owner, { amount: 5, paymentMethod: "CASH", customerName: null, expiresAt: null });
    await createSale(
      owner,
      saleInput([{ productId: rice.id, quantity: 3 }], {
        payments: [
          { method: "GIFT_CARD", amount: 5, giftCardCode: card.code },
          { method: "CASH", amount: 1 },
        ],
      })
    );
    await createServiceSale(owner, {
      kind: "RECHARGE",
      provider: "Tigo",
      reference: null,
      amount: 10,
      paymentMethod: "CASH",
    });
    await adjustStock(owner, rice.id, { mode: "delta", quantity: -1, reason: "WASTE", notes: null });
    await prisma.expense.create({
      data: { category: "Luz", amount: 12, paymentMethod: "TRANSFER", businessId: owner.businessId },
    });
    await addCashMovement(owner, { type: "OUT", amount: 3, reason: "Hielo" });
    await createOwnerTransaction(owner, { type: "WITHDRAWAL", amount: 20, method: "CASH", notes: null });
    const expected = (
      await cashSessionSummary(
        prisma,
        (await prisma.cashSession.findFirstOrThrow({ where: { businessId: owner.businessId } })).id
      )
    ).expected;
    await closeCashSession(owner, { countedAmount: expected.minus(0.5).toNumber(), notes: null });
    return { owner, soda, rice, customer };
  }

  it("cada asiento cuadra y el balance cumple activo = pasivo + patrimonio", async () => {
    const { owner, customer } = await busyMonth();
    const entries = await buildJournal(owner.businessId, new Date(Date.now() + 60_000));
    for (const e of entries) {
      const debit = sum(e.lines.map((l) => l.debit));
      const credit = sum(e.lines.map((l) => l.credit));
      expect(debit.toFixed(2), `${e.kind} ${e.reference} ${e.description}`).toBe(credit.toFixed(2));
    }

    const { fromKey, toKey } = monthKeys(month());
    const statements = await financialStatements({ id: owner.businessId, timezone: TZ }, fromKey, toKey);
    const { balance } = statements;
    expect(balance.balanced).toBe(true);
    expect(balance.totalAssets.toFixed(2)).toBe(balance.totalLiabilities.plus(balance.totalEquity).toFixed(2));

    const find = (list: { code: string; amount: ReturnType<typeof D> }[], code: string) =>
      list.find((a) => a.code === code)?.amount.toNumber() ?? 0;
    // Fiado: 4 fiados − 2 devueltos al fiado − 2 abonados.
    expect(find(balance.assets, ACCOUNTS.RECEIVABLE.code)).toBe(0);
    expect(Number((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance)).toBe(0);
    // Por pagar: 5.35 de la compra a crédito − 1 abonado (el abono de 2 se anuló).
    expect(find(balance.liabilities, ACCOUNTS.PAYABLE.code)).toBe(4.35);
    // Vales: 5 vendidos y 5 canjeados.
    expect(find(balance.liabilities, ACCOUNTS.GIFT_CARDS.code)).toBe(0);
    // Recarga: 10 cobrados − 0.50 de comisión se le deben a Tigo.
    expect(find(balance.liabilities, ACCOUNTS.THIRD_PARTY.code)).toBe(9.5);
    expect(find(balance.equity, ACCOUNTS.CAPITAL.code)).toBeGreaterThan(500);
    expect(find(balance.equity, ACCOUNTS.DRAWINGS.code)).toBe(-20);

    // El ITBMS por pagar del libro es el del reporte de impuestos del mes.
    const tax = await taxReport({ id: owner.businessId, timezone: TZ, country: "PA" }, month());
    expect(find(balance.liabilities, ACCOUNTS.TAX_PAYABLE.code)).toBe(tax.totals.tax);
    // Crédito fiscal: el ITBMS de la compra de sodas (5.35 × 7/107).
    expect(tax.purchases.credit).toBe(0.35);
    expect(tax.netTax).toBe(Math.round((tax.totals.tax - 0.35) * 100) / 100);
    expect(find(balance.assets, ACCOUNTS.TAX_CREDIT.code)).toBe(0.35);

    const income = statements.income;
    // Ventas sin ITBMS: sodas 3.00 + arroz 4.00, mixta 10.00 − devolución 2.00, con vale 6.00; la cancelada se revierte.
    expect(income.sales.toNumber()).toBe(21);
    expect(income.expenses.map((e) => e.name)).toEqual(
      expect.arrayContaining(["Gastos: Luz", ACCOUNTS.SHRINKAGE.name, ACCOUNTS.CASH_DIFF.name])
    );
    // Caja: lo que dice el libro coincide con el conteo del corte.
    const session = await prisma.cashSession.findFirstOrThrow({ where: { businessId: owner.businessId } });
    expect(find(balance.assets, ACCOUNTS.CASH.code)).toBe(Number(session.countedAmount));

    // Flujo de efectivo: el saldo final es Caja + Bancos.
    expect(statements.cashFlow.closing.toNumber()).toBe(
      Math.round((find(balance.assets, ACCOUNTS.CASH.code) + find(balance.assets, ACCOUNTS.BANK.code)) * 100) / 100
    );
    expect(statements.cashFlow.financing.map((l) => l.kind)).toEqual(["OWNER"]);
  });

  it("libro diario, mayor y exportación", async () => {
    const { owner } = await busyMonth();
    const { fromKey, toKey } = monthKeys(month());
    const business = { id: owner.businessId, timezone: TZ };
    const entries = await journal(business, fromKey, toKey);
    expect(entries.length).toBeGreaterThan(15);
    const accounts = await ledger(business, fromKey, toKey);
    const cash = accounts.find((a) => a.code === ACCOUNTS.CASH.code)!;
    expect(cash.opening.toNumber()).toBe(0);
    expect(cash.closing.toNumber()).toBe(cash.lines[cash.lines.length - 1].balance.toNumber());
    const csv = journalCsv(entries, TZ);
    expect(csv.split("\n")[0]).toContain("Fecha,Asiento,Referencia");
    const xls = booksSpreadsheet(entries, accounts, TZ);
    expect(xls).toContain('<Worksheet ss:Name="Libro diario">');
    expect(xls).toContain('<Worksheet ss:Name="Libro mayor">');
  });

  it("el mes cerrado bloquea registrar y cancelar, y se puede reabrir", async () => {
    const owner = await panama();
    const product = await makeProduct(owner, { price: 5, stock: 10 });
    const sale = await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }]));
    await closePeriod({ ...owner, timezone: TZ }, month());
    await expect(createSale(owner, saleInput([{ productId: product.id, quantity: 1 }]))).rejects.toThrow(
      /está cerrado/
    );
    await expect(cancelSale(owner, sale.id, "Error")).rejects.toThrow(/está cerrado/);
    await expect(
      createPurchase(owner, {
        supplierId: null,
        supplierName: "X",
        notes: null,
        paidFromCash: false,
        items: [{ productId: product.id, quantity: 1, unitCost: 1, lotCode: null, expiresAt: null }],
      })
    ).rejects.toThrow(/está cerrado/);
    await expect(
      createOwnerTransaction(owner, { type: "CONTRIBUTION", amount: 10, method: "TRANSFER" })
    ).rejects.toThrow(/está cerrado/);

    await reopenPeriod(owner, month(), "Faltó una venta");
    await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }]));
    const log = await prisma.auditLog.findFirst({ where: { businessId: owner.businessId, action: "period.reopen" } });
    expect(log?.details).toMatchObject({ reason: "Faltó una venta" });
  });

  it("una venta sin conexión fechada en un mes cerrado se registra con la fecha de hoy", async () => {
    const owner = await panama();
    const product = await makeProduct(owner, { price: 5, stock: 10 });
    const lastMonthDate = new Date(Date.now() - 3 * 86_400_000);
    const lastMonth = dayKey(lastMonthDate, TZ).slice(0, 7);
    if (lastMonth === month()) {
      // Si hace tres días fue este mes, se usa el mes actual cerrado para probar el rechazo.
      await closePeriod({ ...owner, timezone: TZ }, month());
      await expect(
        createSale(
          owner,
          saleInput([{ productId: product.id, quantity: 1 }], {
            clientRequestId: "offline-0001",
            createdAt: lastMonthDate,
          })
        )
      ).rejects.toThrow(/está cerrado/);
      return;
    }
    await closePeriod({ ...owner, timezone: TZ }, lastMonth);
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { clientRequestId: "offline-0001", createdAt: lastMonthDate })
    );
    expect(dayKey(sale.createdAt, TZ).slice(0, 7)).toBe(month());
  });

  it("una compra cancelada revierte su asiento", async () => {
    const owner = await panama();
    const product = await makeProduct(owner, { price: 5, cost: 2, stock: 0 });
    const purchase = await createPurchase(owner, {
      supplierId: null,
      supplierName: "X",
      notes: null,
      paidFromCash: false,
      items: [{ productId: product.id, quantity: 4, unitCost: 2, lotCode: null, expiresAt: null }],
    });
    await cancelPurchase(owner, purchase.id, "Devuelta");
    const { fromKey, toKey } = monthKeys(month());
    const { balance } = await financialStatements({ id: owner.businessId, timezone: TZ }, fromKey, toKey);
    expect(balance.totalAssets.toNumber()).toBe(0);
    expect(balance.balanced).toBe(true);
  });
});
