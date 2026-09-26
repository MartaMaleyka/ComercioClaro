import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addCashMovement, closeCashSession, openCashSession } from "@/server/cash";
import { addCustomerPayment } from "@/server/customers";
import { createSale, returnSale } from "@/server/sales";
import { financialSummary } from "@/server/reports";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

describe.skipIf(!hasDatabase)("caja, fiado y reportes", () => {
  beforeEach(resetDatabase);

  it("corte de caja: efectivo esperado y diferencia", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 100, stock: 10 });
    const customer = await prisma.customer.create({ data: { name: "Carmen", businessId: owner.businessId } });

    await openCashSession(owner, { openingAmount: 500, notes: null });
    await expect(openCashSession(owner, { openingAmount: 0, notes: null })).rejects.toThrow(/Ya hay una caja abierta/);

    await createSale(owner, saleInput([{ productId: p.id, quantity: 2 }])); // +200 efectivo
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "CARD" })); // no cuenta
    const credit = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: customer.id }));
    await addCustomerPayment(owner, customer.id, { amount: 60, method: "CASH", notes: null }); // +60
    await addCashMovement(owner, { type: "OUT", amount: 50, reason: "Pago de garrafones" }); // −50
    const cashSale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }])); // +100
    await returnSale(owner, cashSale.id, { items: [{ saleItemId: cashSale.items[0].id, quantity: 1 }], reason: null, refundMethod: "CASH" }); // −100

    const result = await closeCashSession(owner, { countedAmount: 705, notes: null });
    expect(result.expected.toNumber()).toBe(710);
    expect(result.session.difference?.toNumber()).toBe(-5);
    expect(credit.total.toNumber()).toBe(100);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance.toNumber()).toBe(40);
  });

  it("no permite abonar más del saldo", async () => {
    const owner = await createOwner();
    const customer = await prisma.customer.create({ data: { name: "Beto", balance: 30, businessId: owner.businessId } });
    await expect(addCustomerPayment(owner, customer.id, { amount: 31, method: "CASH", notes: null })).rejects.toThrow(/excede/);
  });

  it("la utilidad se calcula con el costo de lo vendido, no con las compras", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 10, cost: 6, stock: 100 });
    await createSale(owner, saleInput([{ productId: p.id, quantity: 10 }]));
    await prisma.expense.create({ data: { category: "Luz", amount: 20, businessId: owner.businessId } });

    const summary = await financialSummary(owner.businessId, { start: new Date(Date.now() - 86400000), end: new Date(Date.now() + 60000) });
    expect(summary.revenue.toNumber()).toBe(100);
    expect(summary.cogs.toNumber()).toBe(60);
    expect(summary.grossProfit.toNumber()).toBe(40);
    expect(summary.netProfit.toNumber()).toBe(20);
    expect(summary.grossMargin.toNumber()).toBe(40);
  });
});
