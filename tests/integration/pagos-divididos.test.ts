import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cancelSale, createSale, listSales, returnSale } from "@/server/sales";
import { cashSessionSummary, closeCashSession, openCashSession } from "@/server/cash";
import { financialSummary } from "@/server/reports";
import { customersAging } from "@/server/customers";
import { issueGiftCard } from "@/server/gift-cards";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const range = () => ({ start: new Date(Date.now() - 3_600_000), end: new Date(Date.now() + 3_600_000) });

describe.skipIf(!hasDatabase)("pagos divididos", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const owner = await createOwner();
    await prisma.business.update({
      where: { id: owner.businessId },
      data: { cardFeeRate: 0.03, loyaltyEnabled: true },
    });
    const product = await makeProduct(owner, { price: 25, cost: 10, stock: 100 });
    const customer = await prisma.customer.create({
      data: { name: "Maritza", creditLimit: 100, businessId: owner.businessId },
    });
    return { owner, product, customer };
  }

  it("efectivo esperado, reportes y comisiones con pago mixto", async () => {
    const { owner, product } = await setup();
    const session = await openCashSession(owner, { openingAmount: 50, notes: null });
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], {
        payments: [
          { method: "CARD", amount: 15, reference: "V-99" },
          { method: "CASH", amount: 20 },
        ],
      })
    );
    expect(sale.paymentMethod).toBe("MIXED");
    expect(sale.change?.toNumber()).toBe(10);
    expect(sale.paymentReference).toBe("V-99");
    expect(sale.payments.map((p) => [p.method, p.amount.toNumber()])).toEqual([
      ["CARD", 15],
      ["CASH", 10],
    ]);

    const summary = await cashSessionSummary(prisma, session.id);
    expect(summary.cashSales.toNumber()).toBe(10);
    expect(summary.expected.toNumber()).toBe(60);
    expect(summary.salesByMethod.CARD.total.toNumber()).toBe(15);

    const report = await financialSummary(owner.businessId, range(), { cardFeeRate: 0.03 });
    expect(report.revenue.toNumber()).toBe(25);
    expect(report.byPaymentMethod.map((m) => [m.method, m.total.toNumber()]).sort()).toEqual([
      ["CARD", 15],
      ["CASH", 10],
    ]);
    expect(report.fees.total.toNumber()).toBe(0.45);

    // El historial filtrado por tarjeta incluye los pagos divididos que la usaron.
    const byCard = await listSales(owner.businessId, "America/Mexico_City", { limit: 10, paymentMethod: "CARD" });
    expect(byCard.items.map((s) => s.id)).toEqual([sale.id]);
    const mixed = await listSales(owner.businessId, "America/Mexico_City", { limit: 10, paymentMethod: "MIXED" });
    expect(mixed.items).toHaveLength(1);

    const closed = await closeCashSession(owner, { countedAmount: 60, notes: null });
    expect(closed.session.difference?.toNumber()).toBe(0);
  });

  it("la parte fiada suma al saldo con su vencimiento y no gana puntos", async () => {
    const { owner, product, customer } = await setup();
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 2 }], {
        customerId: customer.id,
        payments: [
          { method: "CREDIT", amount: 30 },
          { method: "YAPPY", amount: 20, reference: "YP-1" },
        ],
      })
    );
    expect(sale.dueDate).not.toBeNull();
    expect(sale.pointsEarned).toBe(20);
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.balance.toNumber()).toBe(30);
    const aging = (await customersAging(owner.businessId, [customer.id])).get(customer.id)!;
    expect(aging.balance).toBe(30);

    // El límite de crédito se revisa solo con la parte fiada.
    await expect(
      createSale(
        owner,
        saleInput([{ productId: product.id, quantity: 4 }], {
          customerId: customer.id,
          payments: [
            { method: "CREDIT", amount: 80 },
            { method: "CASH", amount: 20 },
          ],
        })
      )
    ).rejects.toThrow(/límite de crédito/);
  });

  it("la parte con vale descuenta del vale", async () => {
    const { owner, product } = await setup();
    await openCashSession(owner, { openingAmount: 0, notes: null });
    const card = await issueGiftCard(owner, { amount: 10, paymentMethod: "CARD", customerName: null, expiresAt: null });
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], {
        payments: [
          { method: "GIFT_CARD", amount: 10, giftCardCode: card.code },
          { method: "CASH", amount: 15 },
        ],
      })
    );
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance.toNumber()).toBe(0);
    expect(sale.giftCardId).toBe(card.id);
    await cancelSale(owner, sale.id, "Error");
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance.toNumber()).toBe(10);
  });

  it("devoluciones con los límites de cada forma y cancelación de lo que queda", async () => {
    const { owner, product, customer } = await setup();
    const first = await openCashSession(owner, { openingAmount: 100, notes: null });
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 4 }], {
        customerId: customer.id,
        payments: [
          { method: "CREDIT", amount: 40 },
          { method: "CASH", amount: 60 },
        ],
      })
    );
    const item = sale.items[0].id;
    // Se puede devolver por tarjeta aunque se haya cobrado en efectivo, hasta lo cobrado en dinero.
    await returnSale(owner, sale.id, {
      items: [{ saleItemId: item, quantity: 1 }],
      reason: null,
      refundMethod: "CARD",
    });
    await returnSale(owner, sale.id, {
      items: [{ saleItemId: item, quantity: 1 }],
      reason: null,
      refundMethod: "CREDIT",
    });
    // Quedan 35 en dinero y 15 fiados: una devolución de 25 al fiado excede lo fiado.
    await expect(
      returnSale(owner, sale.id, { items: [{ saleItemId: item, quantity: 1 }], reason: null, refundMethod: "CREDIT" })
    ).rejects.toThrow(/Solo se pueden devolver 15.00 por Fiado/);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance.toNumber()).toBe(15);

    await closeCashSession(owner, { countedAmount: 160, notes: null });
    const second = await openCashSession(owner, { openingAmount: 0, notes: null });
    await cancelSale(owner, sale.id, "Error de captura");
    // Regresa el dinero que quedaba (60 cobrados − 25 ya devueltos por tarjeta) y se borra lo fiado pendiente.
    const summary = await cashSessionSummary(prisma, second.id);
    expect(summary.cashOut.toNumber()).toBe(35);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance.toNumber()).toBe(0);
    expect(first.id).not.toBe(second.id);
  });

  it("una venta fiada completa conserva sus reglas de devolución", async () => {
    const { owner, product, customer } = await setup();
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: customer.id })
    );
    await expect(
      returnSale(owner, sale.id, {
        items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
        reason: null,
        refundMethod: "CASH",
      })
    ).rejects.toThrow(/fiadas se devuelven/);
    const cash = await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }]));
    await expect(
      returnSale(owner, cash.id, {
        items: [{ saleItemId: cash.items[0].id, quantity: 1 }],
        reason: null,
        refundMethod: "CREDIT",
      })
    ).rejects.toThrow(/Solo las ventas fiadas/);
  });

  it("el backfill de la migración da los mismos totales que las ventas anteriores", async () => {
    const { owner, product, customer } = await setup();
    const session = await openCashSession(owner, { openingAmount: 20, notes: null });
    await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { amountReceived: 30 }));
    await createSale(owner, saleInput([{ productId: product.id, quantity: 2 }], { paymentMethod: "CARD" }));
    await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { paymentMethod: "YAPPY" }));
    await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: customer.id })
    );
    const snapshot = async () => {
      const cash = await cashSessionSummary(prisma, session.id);
      const report = await financialSummary(owner.businessId, range(), { cardFeeRate: 0.03, yappyFeeRate: 0.0107 });
      const aging = (await customersAging(owner.businessId, [customer.id])).get(customer.id)!;
      return {
        expected: cash.expected.toNumber(),
        byMethod: report.byPaymentMethod.map((m) => [m.method, m.total.toNumber(), m.count]).sort(),
        fees: report.fees.total.toNumber(),
        credit: aging.balance,
      };
    };
    const before = await snapshot();
    expect(before.expected).toBe(45);

    // Simula ventas anteriores a los pagos divididos: sin SalePayment, y aplica el backfill.
    await prisma.salePayment.deleteMany({});
    const sql = readFileSync("prisma/migrations/20260930030000_pagos_divididos/migration.sql", "utf8");
    const backfill = sql.slice(sql.indexOf('INSERT INTO "SalePayment"'));
    await prisma.$executeRawUnsafe(backfill);
    expect(await snapshot()).toEqual(before);
  });
});
