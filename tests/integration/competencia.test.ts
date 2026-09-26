import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/server/account";
import { cancelSale, createSale, returnSale, type SalesActor } from "@/server/sales";
import { closeCashSession, openCashSession } from "@/server/cash";
import { cashierReport, monthRange, taxReport } from "@/server/insights";
import { reconcileStatement } from "@/server/reconciliation";
import { createOnlineOrder, onlineOrderCounts, setOnlineOrderStatus } from "@/server/online-orders";
import {
  closePurchaseOrder,
  createPurchaseOrder,
  markPurchaseOrderSent,
  receivePurchaseOrder,
} from "@/server/purchase-orders";
import { cancelTransfer, createTransfer, receiveTransfer, transferDestinations } from "@/server/transfers";
import { cancelServiceSale, createServiceSale, serviceProviders } from "@/server/services";
import { cashSessionSummary } from "@/server/cash";
import { financialSummary } from "@/server/reports";
import { findGiftCard, issueGiftCard, voidGiftCard } from "@/server/gift-cards";
import { dayKey } from "@/lib/dates";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function panamaOwner(settings: Record<string, unknown> = {}): Promise<SalesActor> {
  const { user, businessId } = await registerAccount({
    email: `comp-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Wei",
    businessName: "Minisúper",
    country: "PA",
  });
  if (Object.keys(settings).length > 0) await prisma.business.update({ where: { id: businessId }, data: settings });
  return { userId: user.id, businessId, role: "OWNER" };
}

async function addCashier(owner: SalesActor, name = "Li Na"): Promise<SalesActor> {
  const user = await prisma.user.create({
    data: {
      email: `cajero-${Date.now()}-${Math.random()}@test.com`,
      passwordHash: "x",
      name,
      memberships: { create: { role: "CASHIER", businessId: owner.businessId } },
    },
  });
  return { userId: user.id, businessId: owner.businessId, role: "CASHIER" };
}

async function business(actor: SalesActor) {
  return prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
}

describe.skipIf(!hasDatabase)("reporte de ITBMS", () => {
  beforeEach(resetDatabase);

  it("separa base e impuesto por tasa, prorratea el descuento y resta devoluciones", async () => {
    const owner = await panamaOwner();
    const soda = await makeProduct(owner, { price: 10.7, taxRate: 0.07 });
    const rice = await makeProduct(owner, { price: 5, taxRate: 0 });
    const sale = await createSale(
      owner,
      saleInput(
        [
          { productId: soda.id, quantity: 2 },
          { productId: rice.id, quantity: 1 },
        ],
        { discount: 2.64 }
      )
    );
    expect(Number(sale.total)).toBe(23.76);

    const b = await business(owner);
    let report = await taxReport(b);
    expect(report.taxName).toBe("ITBMS");
    const taxed = report.lines.find((l) => l.taxRate === 0.07)!;
    expect(taxed).toMatchObject({ sales: 19.26, returns: 0, total: 19.26, base: 18, tax: 1.26 });
    expect(report.lines.find((l) => l.taxRate === 0)).toMatchObject({ total: 4.5, base: 4.5, tax: 0 });
    expect(report.totals).toMatchObject({ total: 23.76, tax: 1.26 });

    const sodaItem = sale.items.find((i) => i.productId === soda.id)!;
    await returnSale(owner, sale.id, {
      items: [{ saleItemId: sodaItem.id, quantity: 1 }],
      refundMethod: "CASH",
      reason: "Dañada",
    });
    report = await taxReport(b);
    expect(report.lines.find((l) => l.taxRate === 0.07)).toMatchObject({
      returns: 9.63,
      total: 9.63,
      base: 9,
      tax: 0.63,
    });

    // Otro mes: sin ventas.
    const empty = await taxReport(b, "2020-01");
    expect(empty.lines).toEqual([]);
    expect(monthRange("America/Panama", "2024-12")).toMatchObject({ fromKey: "2024-12-01", toKey: "2024-12-31" });
  });
});

describe.skipIf(!hasDatabase)("desempeño por cajero", () => {
  beforeEach(resetDatabase);

  it("suma ventas, descuentos manuales, cancelaciones y faltantes por persona", async () => {
    const owner = await panamaOwner();
    const cashier = await addCashier(owner);
    const p = await makeProduct(owner, { price: 10, taxRate: 0, stock: 100 });

    await openCashSession(cashier, { openingAmount: 20, notes: null });
    await createSale(cashier, saleInput([{ productId: p.id, quantity: 2, discount: 1 }]));
    await createSale(cashier, saleInput([{ productId: p.id, quantity: 1 }]));
    const toCancel = await createSale(owner, saleInput([{ productId: p.id, quantity: 3 }], { discount: 2 }));
    await cancelSale(owner, toCancel.id, "Error de cobro");
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    // Esperado: 20 + 19 + 10 + 10 (la venta cancelada se devuelve de la misma caja) = 59; contó 54.
    await closeCashSession(cashier, { countedAmount: 54, notes: null });

    const range = monthRange("America/Panama");
    const rows = await cashierReport(owner.businessId, { start: range.start, end: new Date(Date.now() + 60_000) });
    const li = rows.find((r) => r.userId === cashier.userId)!;
    const wei = rows.find((r) => r.userId === owner.userId)!;
    expect(li).toMatchObject({
      name: "Li Na",
      role: "CASHIER",
      salesCount: 2,
      salesTotal: 29,
      discounts: 1,
      closings: 1,
      shortages: 5,
    });
    expect(li.averageTicket).toBe(14.5);
    // La venta cancelada no cuenta como venta ni su descuento; sí la cancelación.
    expect(wei).toMatchObject({ salesCount: 1, salesTotal: 10, discounts: 0, cancellations: 1 });
  });
});

describe.skipIf(!hasDatabase)("conciliación bancaria", () => {
  beforeEach(resetDatabase);

  it("cruza el estado de cuenta con las ventas de Yappy", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 2.1, taxRate: 0, stock: 50 });
    const paid = await createSale(
      owner,
      saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "YAPPY", paymentReference: "998877" })
    );
    const byAmount = await createSale(owner, saleInput([{ productId: p.id, quantity: 2 }], { paymentMethod: "YAPPY" }));
    const missing = await createSale(owner, saleInput([{ productId: p.id, quantity: 3 }], { paymentMethod: "YAPPY" }));
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }])); // efectivo: no entra
    const today = dayKey(new Date(), "America/Panama").split("-").reverse().join("/");
    const csv = `Fecha,Descripción,Referencia,Monto\n${today},PAGO YAPPY,998877,2.10\n${today},PAGO YAPPY,,4.20\n${today},OTRO,,50.00\n`;

    const b = await business(owner);
    const result = await reconcileStatement(b, { csv, method: "YAPPY" });
    expect(result.matches.map((m) => [m.type, m.sales[0].id])).toEqual([
      ["reference", paid.id],
      ["amount", byAmount.id],
    ]);
    expect(result.unmatchedSales.map((s) => s.id)).toEqual([missing.id]);
    expect(result.unmatchedLines.map((l) => l.amount)).toEqual([50]);
    await expect(reconcileStatement(b, { csv: "hola,mundo\n1,2", method: "YAPPY" })).rejects.toThrow(/columnas/);
  });
});

describe.skipIf(!hasDatabase)("pedidos en línea", () => {
  beforeEach(resetDatabase);

  it("guarda el pedido del catálogo, lo cobra en el punto de venta y lo reabre si se cancela la venta", async () => {
    const owner = await panamaOwner({ catalogEnabled: true, catalogSlug: "tienda-prueba" });
    const soda = await makeProduct(owner, { price: 2.1, taxRate: 0, stock: 5 });
    const order = await createOnlineOrder("tienda-prueba", {
      customerName: "Ana",
      phone: "6123-4567",
      notes: null,
      fulfillment: "DELIVERY",
      address: "Calle 50",
      items: [{ productId: soda.id, quantity: 2 }],
    });
    expect(order).toMatchObject({ number: 1 });
    expect(Number(order.total)).toBe(4.2);
    expect(await onlineOrderCounts(owner.businessId)).toEqual({ new: 1, active: 1 });

    await expect(
      createOnlineOrder("tienda-prueba", {
        customerName: "Beto",
        phone: null,
        notes: null,
        fulfillment: "PICKUP",
        address: null,
        items: [{ productId: soda.id, quantity: 9 }],
      })
    ).rejects.toThrow(/No hay suficiente/);
    await expect(
      createOnlineOrder("otra", {
        customerName: "Beto",
        phone: null,
        notes: null,
        fulfillment: "PICKUP",
        address: null,
        items: [{ productId: soda.id, quantity: 1 }],
      })
    ).rejects.toThrow(/Catálogo/);

    await setOnlineOrderStatus(owner, order.id, "ACCEPTED");
    await expect(setOnlineOrderStatus(owner, order.id, "ACCEPTED")).rejects.toThrow(/no puede cambiar/);

    const sale = await createSale(owner, saleInput([{ productId: soda.id, quantity: 2 }], { onlineOrderId: order.id }));
    let saved = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: "DELIVERED", saleId: sale.id });
    await expect(
      createSale(owner, saleInput([{ productId: soda.id, quantity: 1 }], { onlineOrderId: order.id }))
    ).rejects.toThrow(/ya fue cobrado/);

    await cancelSale(owner, sale.id, "Se cobró mal");
    saved = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: "READY", saleId: null });
  });
});

describe.skipIf(!hasDatabase)("órdenes de compra", () => {
  beforeEach(resetDatabase);

  it("recibe en partes, registra compras con costo promedio y cierra con faltantes", async () => {
    const owner = await panamaOwner();
    const beer = await makeProduct(owner, { price: 1, cost: 0.6, stock: 24, taxRate: 0.1 });
    const rice = await makeProduct(owner, { price: 4, cost: 3, stock: 10, taxRate: 0 });
    const order = await createPurchaseOrder(owner, {
      supplierId: null,
      supplierName: "Cervecería Nacional",
      notes: null,
      expectedAt: null,
      lines: [
        { productId: beer.id, quantity: 48, unitCost: 0.7 },
        { productId: rice.id, quantity: 10, unitCost: null },
      ],
    });
    expect(order).toMatchObject({ folio: 1, status: "DRAFT" });
    expect(Number(order.total)).toBe(63.6);

    await markPurchaseOrderSent(owner, order.id);
    const beerLine = order.lines.find((l) => l.productId === beer.id)!;
    const riceLine = order.lines.find((l) => l.productId === rice.id)!;
    await expect(
      receivePurchaseOrder(owner, order.id, {
        paidFromCash: false,
        notes: null,
        lines: [{ lineId: beerLine.id, quantity: 50, lotCode: null }],
      })
    ).rejects.toThrow(/más de lo pendiente/);

    const partial = await receivePurchaseOrder(owner, order.id, {
      paidFromCash: false,
      notes: "Factura 123",
      lines: [
        { lineId: beerLine.id, quantity: 24, lotCode: null },
        { lineId: riceLine.id, quantity: 0, lotCode: null },
      ],
    });
    expect(partial.status).toBe("PARTIAL");
    expect(partial.purchases).toHaveLength(1);
    const updatedBeer = await prisma.product.findUniqueOrThrow({ where: { id: beer.id } });
    expect(Number(updatedBeer.stock)).toBe(48);
    expect(Number(updatedBeer.cost)).toBe(0.65);
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: partial.purchases[0].id } });
    expect(purchase).toMatchObject({ purchaseOrderId: order.id, supplierName: "Cervecería Nacional" });
    expect(purchase.notes).toContain("Orden de compra #1");

    const closed = await closePurchaseOrder(owner, order.id);
    expect(closed.status).toBe("RECEIVED");
    await expect(
      receivePurchaseOrder(owner, order.id, {
        paidFromCash: false,
        notes: null,
        lines: [{ lineId: riceLine.id, quantity: 1, lotCode: null }],
      })
    ).rejects.toThrow(/cerrada/);

    const empty = await createPurchaseOrder(owner, {
      supplierId: null,
      supplierName: null,
      notes: null,
      expectedAt: null,
      lines: [{ productId: rice.id, quantity: 1, unitCost: null }],
    });
    expect((await closePurchaseOrder(owner, empty.id)).status).toBe("CANCELLED");
  });
});

describe.skipIf(!hasDatabase)("traspasos entre sucursales", () => {
  beforeEach(resetDatabase);

  it("envía, recibe (encontrando o creando el producto) y cancela", async () => {
    const owner = await panamaOwner();
    const branch = await prisma.business.create({
      data: {
        name: "Sucursal Centro",
        country: "PA",
        memberships: { create: { userId: owner.userId, role: "OWNER" } },
      },
    });
    const dest: SalesActor = { userId: owner.userId, businessId: branch.id, role: "OWNER" };
    const soda = await makeProduct(owner, {
      name: "Coca-Cola 2 L",
      barcode: "7451001000042",
      price: 2.1,
      cost: 1.5,
      stock: 20,
      taxRate: 0.07,
    });
    const eggs = await makeProduct(owner, { name: "Huevo", price: 0.2, cost: 0.14, stock: 100, taxRate: 0 });
    // En destino ya existe la soda (mismo código) con otro costo; el huevo no existe.
    const destSoda = await makeProduct(dest, {
      name: "Coca Cola 2L",
      barcode: "7451001000042",
      price: 2.2,
      cost: 1.7,
      stock: 5,
      taxRate: 0.07,
    });

    expect(await transferDestinations(owner.userId, owner.businessId)).toEqual([
      { id: branch.id, name: "Sucursal Centro" },
    ]);
    await expect(
      createTransfer(owner, { toBusinessId: branch.id, notes: null, lines: [{ productId: soda.id, quantity: 25 }] })
    ).rejects.toThrow(/Stock insuficiente/);

    const transfer = await createTransfer(owner, {
      toBusinessId: branch.id,
      notes: null,
      lines: [
        { productId: soda.id, quantity: 5 },
        { productId: eggs.id, quantity: 30 },
      ],
    });
    expect(transfer.status).toBe("IN_TRANSIT");
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: soda.id } })).stock)).toBe(15);
    await expect(receiveTransfer(owner, transfer.id)).rejects.toThrow(/no está en tránsito hacia esta sucursal/);

    const received = await receiveTransfer(dest, transfer.id);
    expect(received.status).toBe("RECEIVED");
    const soda2 = await prisma.product.findUniqueOrThrow({ where: { id: destSoda.id } });
    expect(Number(soda2.stock)).toBe(10);
    expect(Number(soda2.cost)).toBe(1.6);
    const newEggs = await prisma.product.findFirstOrThrow({ where: { businessId: branch.id, name: "Huevo" } });
    expect(Number(newEggs.stock)).toBe(30);
    expect(Number(newEggs.price)).toBe(0.2);

    const second = await createTransfer(owner, {
      toBusinessId: branch.id,
      notes: null,
      lines: [{ productId: soda.id, quantity: 3 }],
    });
    await cancelTransfer(owner, second.id);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: soda.id } })).stock)).toBe(15);
    await expect(receiveTransfer(dest, second.id)).rejects.toThrow(/no está en tránsito/);
  });
});

describe.skipIf(!hasDatabase)("recargas y pago de servicios", () => {
  beforeEach(resetDatabase);

  it("el efectivo entra a la caja sin ser venta y la comisión suma a la ganancia", async () => {
    const owner = await panamaOwner({
      serviceProviders: [{ name: "Tigo", kind: "RECHARGE", commissionRate: 0.05 }],
    });
    expect(serviceProviders(await business(owner))).toHaveLength(1);
    expect(serviceProviders({ country: "PA", serviceProviders: null }).map((p) => p.name)).toContain("+Móvil");

    await expect(
      createServiceSale(owner, {
        kind: "RECHARGE",
        provider: "tigo",
        reference: "61234567",
        amount: 10,
        paymentMethod: "CASH",
      })
    ).rejects.toThrow(/Abre la caja/);
    const session = await openCashSession(owner, { openingAmount: 20, notes: null });
    const recharge = await createServiceSale(owner, {
      kind: "OTHER",
      provider: "tigo",
      reference: "61234567",
      amount: 10,
      paymentMethod: "CASH",
    });
    expect(recharge).toMatchObject({ provider: "Tigo", kind: "RECHARGE" });
    expect(Number(recharge.commission)).toBe(0.5);
    const bill = await createServiceSale(owner, {
      kind: "BILL",
      provider: "Naturgy",
      reference: "123",
      amount: 30,
      paymentMethod: "YAPPY",
    });
    expect(Number(bill.commission)).toBe(0);

    let summary = await cashSessionSummary(prisma, session.id);
    expect(Number(summary.serviceCash)).toBe(10);
    expect(Number(summary.expected)).toBe(30);

    const range = { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) };
    const finance = await financialSummary(owner.businessId, range);
    expect(Number(finance.revenue)).toBe(0);
    expect(Number(finance.serviceCommissions)).toBe(0.5);
    expect(Number(finance.netProfit)).toBe(0.5);

    await cancelServiceSale(owner, recharge.id);
    summary = await cashSessionSummary(prisma, session.id);
    expect(Number(summary.expected)).toBe(20);
    await expect(cancelServiceSale(owner, recharge.id)).rejects.toThrow(/ya está anulado/);
    await closeCashSession(owner, { countedAmount: 20, notes: null });
    await expect(cancelServiceSale(owner, bill.id)).resolves.toMatchObject({ status: "CANCELLED" });
  });
});

describe.skipIf(!hasDatabase)("vales", () => {
  beforeEach(resetDatabase);

  it("se venden como pasivo, pagan ventas y recuperan saldo en devoluciones y cancelaciones", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 10, taxRate: 0, stock: 20 });
    await expect(
      issueGiftCard(owner, { amount: 25, paymentMethod: "CASH", customerName: "Ana", expiresAt: null })
    ).rejects.toThrow(/Abre la caja/);
    const session = await openCashSession(owner, { openingAmount: 0, notes: null });
    const card = await issueGiftCard(owner, {
      amount: 25,
      paymentMethod: "CASH",
      customerName: "Ana",
      expiresAt: null,
    });
    expect(card.code).toMatch(/^[1-9]\d{11}$/);
    let summary = await cashSessionSummary(prisma, session.id);
    expect(Number(summary.giftCardCash)).toBe(25);
    expect(Number(summary.expected)).toBe(25);

    const range = { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) };
    expect(Number((await financialSummary(owner.businessId, range)).revenue)).toBe(0);

    await expect(
      createSale(
        owner,
        saleInput([{ productId: p.id, quantity: 3 }], { paymentMethod: "GIFT_CARD", giftCardCode: card.code })
      )
    ).rejects.toThrow(/no alcanza/);
    const sale = await createSale(
      owner,
      saleInput([{ productId: p.id, quantity: 2 }], { paymentMethod: "GIFT_CARD", giftCardCode: card.code })
    );
    expect(sale.paymentReference).toBe(`••••${card.code.slice(-4)}`);
    expect(Number((await findGiftCard(owner.businessId, card.code)).balance)).toBe(5);
    // La venta con vale es ingreso, pero no efectivo.
    expect(Number((await financialSummary(owner.businessId, range)).revenue)).toBe(20);
    summary = await cashSessionSummary(prisma, session.id);
    expect(Number(summary.expected)).toBe(25);

    await expect(
      returnSale(owner, sale.id, {
        items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
        refundMethod: "CASH",
        reason: null,
      })
    ).rejects.toThrow(/mismo vale/);
    await returnSale(owner, sale.id, {
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
      refundMethod: "GIFT_CARD",
      reason: null,
    });
    expect(Number((await findGiftCard(owner.businessId, card.code)).balance)).toBe(15);
    await cancelSale(owner, sale.id, "Error");
    expect(Number((await findGiftCard(owner.businessId, card.code)).balance)).toBe(25);

    await voidGiftCard(owner, card.id);
    await expect(
      createSale(
        owner,
        saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "GIFT_CARD", giftCardCode: card.code })
      )
    ).rejects.toThrow(/anulado/);
    await expect(
      createSale(
        owner,
        saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "GIFT_CARD", giftCardCode: "999" })
      )
    ).rejects.toThrow(/No existe/);
  });
});
