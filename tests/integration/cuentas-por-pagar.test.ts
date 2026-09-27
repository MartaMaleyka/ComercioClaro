import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey } from "@/lib/dates";
import { cancelPurchase, createPurchase } from "@/server/purchases";
import { cashSessionSummary, openCashSession } from "@/server/cash";
import { createPurchaseOrder, receivePurchaseOrder } from "@/server/purchase-orders";
import {
  agingBucket,
  createSupplierBill,
  paySupplierBill,
  payablesDueSoon,
  payablesSummary,
  supplierStatement,
  voidSupplierPayment,
} from "@/server/payables";
import { dashboard } from "@/server/reports";
import { createOwner, hasDatabase, makeProduct, resetDatabase } from "../helpers";

const TZ = "America/Mexico_City";
const today = () => dayKey(new Date(), TZ);

describe("antigüedad de saldos", () => {
  it("clasifica por días de atraso", () => {
    expect([0, 1, 30, 31, 60, 61].map(agingBucket)).toEqual([
      "current",
      "d1_30",
      "d1_30",
      "d31_60",
      "d31_60",
      "d60plus",
    ]);
  });
});

describe.skipIf(!hasDatabase)("cuentas por pagar a proveedores", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const owner = await createOwner();
    const supplier = await prisma.supplier.create({
      data: { name: "Distribuidora Istmo", creditDays: 15, businessId: owner.businessId },
    });
    const soda = await makeProduct(owner, { name: "Soda", cost: 1.07, taxRate: 0.07, stock: 0 });
    return { owner, supplier, soda };
  }

  it("la compra a crédito crea la factura con su ITBMS y vencimiento", async () => {
    const { owner, supplier, soda } = await setup();
    const purchase = await createPurchase(owner, {
      supplierId: supplier.id,
      supplierName: null,
      notes: null,
      paidFromCash: false,
      onCredit: true,
      invoiceNumber: "F-100",
      dueDate: null,
      items: [{ productId: soda.id, quantity: 10, unitCost: 1.07, lotCode: null, expiresAt: null }],
    });
    expect(purchase.tax.toNumber()).toBe(0.7);
    expect(purchase.onCredit).toBe(true);
    const bill = await prisma.supplierBill.findUniqueOrThrow({ where: { purchaseId: purchase.id } });
    expect(bill).toMatchObject({ number: "F-100", status: "OPEN", supplierName: "Distribuidora Istmo" });
    expect(bill.balance.toNumber()).toBe(10.7);
    expect(bill.tax.toNumber()).toBe(0.7);
    expect(bill.dueDate.toISOString().slice(0, 10)).toBe(addDays(today(), 15));

    await expect(
      createPurchase(owner, {
        supplierId: supplier.id,
        supplierName: null,
        notes: null,
        paidFromCash: true,
        onCredit: true,
        items: [{ productId: soda.id, quantity: 1, unitCost: 1, lotCode: null, expiresAt: null }],
      })
    ).rejects.toThrow(/crédito/);
  });

  it("los abonos en efectivo salen de la caja y se pueden anular", async () => {
    const { owner, supplier } = await setup();
    const bill = await createSupplierBill(owner, { supplierId: supplier.id, total: 100, tax: 0 });
    await expect(paySupplierBill(owner, bill.id, { amount: 30, method: "CASH", fromCash: true })).rejects.toThrow(
      /caja abierta/
    );
    const session = await openCashSession(owner, { openingAmount: 200, notes: null });
    const cashPayment = await paySupplierBill(owner, bill.id, { amount: 30, method: "CASH", fromCash: true });
    await paySupplierBill(owner, bill.id, { amount: 50, method: "TRANSFER", fromCash: false, reference: "ACH-1" });
    let summary = await cashSessionSummary(prisma, session.id);
    expect(summary.cashSupplierPayments.toNumber()).toBe(30);
    expect(summary.expected.toNumber()).toBe(170);

    await expect(paySupplierBill(owner, bill.id, { amount: 25, method: "TRANSFER", fromCash: false })).rejects.toThrow(
      /excede el saldo/
    );
    await paySupplierBill(owner, bill.id, { amount: 20, method: "YAPPY", fromCash: false });
    expect((await prisma.supplierBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PAID");

    const reopened = await voidSupplierPayment(owner, cashPayment.id, "Error de captura");
    expect(reopened.status).toBe("OPEN");
    expect(reopened.balance.toNumber()).toBe(30);
    summary = await cashSessionSummary(prisma, session.id);
    expect(summary.expected.toNumber()).toBe(200);
    await expect(voidSupplierPayment(owner, cashPayment.id, "otra vez")).rejects.toThrow(/anulado/);
  });

  it("antigüedad, vencido, lo que vence esta semana y el tablero", async () => {
    const { owner, supplier } = await setup();
    const t = today();
    await createSupplierBill(owner, {
      supplierId: supplier.id,
      total: 10,
      date: addDays(t, -10),
      dueDate: addDays(t, 5),
    });
    await createSupplierBill(owner, {
      supplierName: "Hielo Frío",
      total: 20,
      date: addDays(t, -40),
      dueDate: addDays(t, -10),
    });
    await createSupplierBill(owner, {
      supplierId: supplier.id,
      total: 30,
      date: addDays(t, -90),
      dueDate: addDays(t, -45),
    });
    await createSupplierBill(owner, {
      supplierId: supplier.id,
      total: 40,
      date: addDays(t, -100),
      dueDate: addDays(t, -70),
    });
    await createSupplierBill(owner, { supplierId: supplier.id, total: 50, dueDate: addDays(t, 20) });

    const summary = await payablesSummary(owner.businessId, TZ);
    expect(summary.total.toNumber()).toBe(150);
    expect(Object.fromEntries(Object.entries(summary.aging).map(([k, v]) => [k, v.toNumber()]))).toEqual({
      current: 60,
      d1_30: 20,
      d31_60: 30,
      d60plus: 40,
    });
    expect(summary.overdue).toMatchObject({ count: 3 });
    expect(summary.overdue.amount.toNumber()).toBe(90);
    expect(summary.dueThisWeek.amount.toNumber()).toBe(10);
    expect(summary.suppliers[0]).toMatchObject({ name: "Distribuidora Istmo", bills: 4 });

    const soon = await payablesDueSoon(owner.businessId, TZ);
    expect(soon.map((b) => b.daysOverdue)).toEqual([70, 45, 10]);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const board = await dashboard({ ...business, timezone: TZ });
    expect(board.payables.dueThisWeek.count).toBe(1);
    expect(board.payables.overdue.amount.toNumber()).toBe(90);

    await expect(
      createSupplierBill(owner, { supplierId: supplier.id, total: 5, date: t, dueDate: addDays(t, -1) })
    ).rejects.toThrow(/anterior/);
    await expect(createSupplierBill(owner, { total: 5 })).rejects.toThrow(/proveedor/);
  });

  it("estado de cuenta con saldo acumulado", async () => {
    const { owner, supplier } = await setup();
    const t = today();
    const a = await createSupplierBill(owner, {
      supplierId: supplier.id,
      number: "A1",
      total: 100,
      date: addDays(t, -5),
    });
    await createSupplierBill(owner, { supplierId: supplier.id, number: "A2", total: 50, date: addDays(t, -1) });
    await paySupplierBill(owner, a.id, { amount: 60, method: "TRANSFER", fromCash: false });
    const statement = await supplierStatement(owner.businessId, supplier.id, TZ);
    expect(statement.lines.map((l) => [l.kind, l.balance.toNumber()])).toEqual([
      ["BILL", 100],
      ["BILL", 150],
      ["PAYMENT", 90],
    ]);
    expect(statement.balance.toNumber()).toBe(90);
  });

  it("cancelar una compra a crédito cancela su factura, salvo que tenga abonos", async () => {
    const { owner, supplier, soda } = await setup();
    const input = {
      supplierId: supplier.id,
      supplierName: null,
      notes: null,
      paidFromCash: false,
      onCredit: true,
      items: [{ productId: soda.id, quantity: 5, unitCost: 2, lotCode: null, expiresAt: null }],
    };
    const first = await createPurchase(owner, input);
    await cancelPurchase(owner, first.id, "Devuelta");
    expect((await prisma.supplierBill.findUniqueOrThrow({ where: { purchaseId: first.id } })).status).toBe("CANCELLED");

    const second = await createPurchase(owner, input);
    const bill = await prisma.supplierBill.findUniqueOrThrow({ where: { purchaseId: second.id } });
    await paySupplierBill(owner, bill.id, { amount: 1, method: "TRANSFER", fromCash: false });
    await expect(cancelPurchase(owner, second.id, "Devuelta")).rejects.toThrow(/abonos/);
  });

  it("recibir una orden de compra a crédito crea la cuenta por pagar", async () => {
    const { owner, supplier, soda } = await setup();
    const order = await createPurchaseOrder(owner, {
      supplierId: supplier.id,
      supplierName: null,
      notes: null,
      expectedAt: null,
      lines: [{ productId: soda.id, quantity: 12, unitCost: 1 }],
    });
    await receivePurchaseOrder(owner, order.id, {
      paidFromCash: false,
      onCredit: true,
      invoiceNumber: "OC-9",
      dueDate: addDays(today(), 30),
      notes: null,
      lines: [{ lineId: order.lines[0].id, quantity: 12, lotCode: null }],
    });
    const bill = await prisma.supplierBill.findFirstOrThrow({ where: { businessId: owner.businessId } });
    expect(bill).toMatchObject({ number: "OC-9", status: "OPEN" });
    expect(bill.total.toNumber()).toBe(12);
  });
});
