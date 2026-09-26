import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/server/account";
import { cancelSale, createSale, returnSale, type SalesActor } from "@/server/sales";
import { closeCashSession, openCashSession } from "@/server/cash";
import { seniorReport } from "@/server/insights";
import { dashboard } from "@/server/reports";
import { reorderSuggestions } from "@/server/inventory";
import { createOnlineOrder } from "@/server/online-orders";
import { syncDeliveryZones } from "@/server/delivery";
import { currentPaydayEnd } from "@/lib/credit-terms";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function panamaOwner(settings: Record<string, unknown> = {}): Promise<SalesActor> {
  const { user, businessId } = await registerAccount({
    email: `pa-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Yamileth",
    businessName: "Abarrotería",
    country: "PA",
  });
  if (Object.keys(settings).length > 0) await prisma.business.update({ where: { id: businessId }, data: settings });
  return { userId: user.id, businessId, role: "OWNER" };
}

describe.skipIf(!hasDatabase)("venta por libra", () => {
  beforeEach(resetDatabase);

  it("vende queso por libra con cantidades decimales", async () => {
    const owner = await panamaOwner();
    const cheese = await makeProduct(owner, { unit: "LB", price: 3.5, stock: 10, taxRate: 0 });
    const sale = await createSale(owner, saleInput([{ productId: cheese.id, quantity: 1.5 }]));
    expect(sale.total.toNumber()).toBe(5.25);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: cheese.id } });
    expect(after.stock.toNumber()).toBe(8.5);
  });
});

describe.skipIf(!hasDatabase)("descuento de jubilado", () => {
  beforeEach(resetDatabase);

  it("aplica el porcentaje solo a lo que corresponde y no se suma a la promoción", async () => {
    const owner = await panamaOwner({ seniorDiscountRate: 0.2 });
    const medicine = await makeProduct(owner, { price: 10, stock: 10, taxRate: 0 });
    const candy = await makeProduct(owner, { price: 1, stock: 10, taxRate: 0.07, seniorEligible: false });
    const soap = await makeProduct(owner, { price: 2, stock: 10, taxRate: 0.07 });
    // 2x1 en jabón: 2 de descuento, más que el 20% (0.80): gana la promoción.
    await prisma.promotion.create({
      data: {
        name: "2x1 jabón",
        type: "BUY_X_PAY_Y",
        buyQty: 2,
        payQty: 1,
        productId: soap.id,
        businessId: owner.businessId,
      },
    });

    const sale = await createSale(
      owner,
      saleInput(
        [
          { productId: medicine.id, quantity: 1 },
          { productId: candy.id, quantity: 2 },
          { productId: soap.id, quantity: 2 },
        ],
        { senior: true, seniorId: "8-123-456" }
      )
    );
    const line = (id: string) => sale.items.find((i) => i.productId === id)!;
    expect(line(medicine.id).seniorDiscount.toNumber()).toBe(2);
    expect(line(candy.id).seniorDiscount.toNumber()).toBe(0);
    expect(line(soap.id).seniorDiscount.toNumber()).toBe(0);
    expect(line(soap.id).promotionDiscount.toNumber()).toBe(2);
    expect(sale.seniorDiscount.toNumber()).toBe(2);
    expect(sale.seniorId).toBe("8-123-456");
    expect(sale.total.toNumber()).toBe(8 + 2 + 2);

    // Si el de jubilado es mayor, se aplica en lugar de la promoción.
    await prisma.promotion.updateMany({
      where: { businessId: owner.businessId },
      data: { type: "PERCENT", percent: 0.05 },
    });
    const second = await createSale(owner, saleInput([{ productId: soap.id, quantity: 2 }], { senior: true }));
    expect(second.items[0].seniorDiscount.toNumber()).toBe(0.8);
    expect(second.items[0].promotionDiscount.toNumber()).toBe(0);
    expect(second.items[0].promotionId).toBeNull();

    const b = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const report = await seniorReport(b);
    expect(report.count).toBe(2);
    expect(report.discount).toBe(2.8);
    expect(report.sales[0]).toMatchObject({ seniorId: "8-123-456", cashier: "Yamileth" });

    await cancelSale(owner, second.id, "error");
    expect((await seniorReport(b)).count).toBe(1);
  });

  it("se aplica solo al cliente registrado como jubilado y exige configurarlo", async () => {
    const off = await panamaOwner();
    const p = await makeProduct(off, { price: 10, stock: 5 });
    await expect(createSale(off, saleInput([{ productId: p.id, quantity: 1 }], { senior: true }))).rejects.toThrow(
      /jubilado/
    );

    const owner = await panamaOwner({ seniorDiscountRate: 0.25 });
    const meal = await makeProduct(owner, { price: 4, stock: 5, taxRate: 0 });
    const customer = await prisma.customer.create({
      data: { name: "Don Pedro", isSenior: true, seniorId: "4-700-1234", businessId: owner.businessId },
    });
    const sale = await createSale(owner, saleInput([{ productId: meal.id, quantity: 1 }], { customerId: customer.id }));
    expect(sale.total.toNumber()).toBe(3);
    expect(sale.seniorId).toBe("4-700-1234");
  });
});

describe.skipIf(!hasDatabase)("fiado a la quincena y a la cosecha", () => {
  beforeEach(resetDatabase);

  it("pone el vencimiento según el plazo del cliente", async () => {
    const owner = await panamaOwner();
    const rice = await makeProduct(owner, { price: 5, stock: 50, taxRate: 0 });
    const worker = await prisma.customer.create({
      data: { name: "Chelo", creditTerm: "QUINCENA", businessId: owner.businessId },
    });
    const farmer = await prisma.customer.create({
      data: {
        name: "Nando",
        creditTerm: "FIXED",
        creditDueDate: new Date(Date.UTC(new Date().getUTCFullYear() + 1, 1, 10)),
        businessId: owner.businessId,
      },
    });

    const s1 = await createSale(
      owner,
      saleInput([{ productId: rice.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: worker.id })
    );
    const days = (s1.dueDate!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(17);
    const payday = new Date(s1.dueDate!.getTime() - 1).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
    const [y, m, d] = payday.split("-").map(Number);
    expect(d === 15 || d === new Date(Date.UTC(y, m, 0)).getUTCDate()).toBe(true);

    const s2 = await createSale(
      owner,
      saleInput([{ productId: rice.id, quantity: 2 }], { paymentMethod: "CREDIT", customerId: farmer.id })
    );
    expect(s2.dueDate!.toISOString().slice(0, 10)).toBe(`${new Date().getUTCFullYear() + 1}-02-11`);

    const b = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const dash = await dashboard(b);
    // En día de pago, lo fiado hoy vence en la quincena siguiente, no en esta.
    const dueNow = s1.dueDate!.getTime() <= currentPaydayEnd(new Date(), "America/Panama").getTime();
    expect(dash.receivables.dueThisPeriod).toBe(dueNow ? 5 : 0);
    expect(dash.receivables.dueThisPeriodCustomers).toBe(dueNow ? 1 : 0);
  });
});

describe.skipIf(!hasDatabase)("corte por billetes y monedas", () => {
  beforeEach(resetDatabase);

  it("guarda el detalle y exige que sume el efectivo contado", async () => {
    const owner = await panamaOwner();
    await openCashSession(owner, { openingAmount: 20, notes: null });
    const breakdown = [
      { value: 20, count: 1 },
      { value: 0.25, count: 3 },
      { value: 0.05, count: 1 },
    ];
    await expect(
      closeCashSession(owner, { countedAmount: 21, notes: null, countBreakdown: breakdown })
    ).rejects.toThrow(/no coincide/);
    const result = await closeCashSession(owner, { countedAmount: 20.8, notes: null, countBreakdown: breakdown });
    expect(result.session.countBreakdown).toEqual(breakdown);
    expect(result.session.difference!.toNumber()).toBe(0.8);
  });
});

describe.skipIf(!hasDatabase)("ventas sin conexión en el interior", () => {
  beforeEach(resetDatabase);

  it("respeta la fecha de la venta según los días configurados", async () => {
    const owner = await panamaOwner({ offlineDays: 30 });
    const p = await makeProduct(owner, { price: 1, stock: 10 });
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000);
    const sale = await createSale(
      owner,
      saleInput([{ productId: p.id, quantity: 1 }], { clientRequestId: "offline-interior-1", createdAt: twentyDaysAgo })
    );
    expect(sale.createdAt.getTime()).toBe(twentyDaysAgo.getTime());

    await prisma.business.update({ where: { id: owner.businessId }, data: { offlineDays: 7 } });
    const capital = await createSale(
      owner,
      saleInput([{ productId: p.id, quantity: 1 }], { clientRequestId: "offline-capital-1", createdAt: twentyDaysAgo })
    );
    expect(Date.now() - capital.createdAt.getTime()).toBeLessThan(60_000);
  });
});

describe.skipIf(!hasDatabase)("entregas por zona y servicios", () => {
  beforeEach(resetDatabase);

  it("los servicios no llevan existencias ni aparecen en reabastecer", async () => {
    const owner = await panamaOwner();
    const repair = await makeProduct(owner, { price: 15, stock: 0, trackStock: false, minStock: 5 });
    const sale = await createSale(owner, saleInput([{ productId: repair.id, quantity: 2 }]));
    expect(sale.total.toNumber()).toBe(30);
    await returnSale(owner, sale.id, {
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
      reason: null,
      refundMethod: "CASH",
    });
    await cancelSale(owner, sale.id, "prueba");
    const after = await prisma.product.findUniqueOrThrow({ where: { id: repair.id } });
    expect(after.stock.toNumber()).toBe(0);
    expect(await prisma.stockMovement.count({ where: { productId: repair.id } })).toBe(0);
    const suggestions = await reorderSuggestions(owner.businessId);
    expect(JSON.stringify(suggestions)).not.toContain(repair.id);
  });

  it("cobra la zona de entrega del catálogo como un renglón de servicio", async () => {
    const owner = await panamaOwner({ catalogEnabled: true, catalogSlug: "super-capital" });
    const soda = await makeProduct(owner, { price: 2, stock: 5, taxRate: 0 });
    const zones = await prisma.$transaction((tx) =>
      syncDeliveryZones(tx, owner.businessId, [
        { name: "San Francisco", fee: 2.5 },
        { name: "Bella Vista", fee: 3 },
      ])
    );
    await prisma.business.update({ where: { id: owner.businessId }, data: { deliveryZones: zones as unknown as object[] } });
    const zoneProduct = await prisma.product.findUniqueOrThrow({ where: { id: zones[0].productId } });
    expect(zoneProduct).toMatchObject({ name: "Entrega · San Francisco", trackStock: false, seniorEligible: false });

    const base = {
      customerName: "Ana",
      phone: null,
      notes: null,
      fulfillment: "DELIVERY" as const,
      address: "PH Torre Azul, frente al parque",
      items: [{ productId: soda.id, quantity: 2 }],
    };
    await expect(createOnlineOrder("super-capital", base)).rejects.toThrow(/zona/);
    const order = await createOnlineOrder("super-capital", { ...base, deliveryZone: "san francisco" });
    expect(Number(order.total)).toBe(6.5);
    const saved = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.deliveryZone).toBe("San Francisco");
    expect(saved.deliveryFee.toNumber()).toBe(2.5);
    const items = saved.items as { productId: string; price: number }[];
    expect(items.map((i) => i.productId)).toEqual([soda.id, zones[0].productId]);

    // Al cobrarlo en el punto de venta, la entrega es un renglón más y no toca existencias.
    const sale = await createSale(
      owner,
      saleInput(
        items.map((i) => ({ productId: i.productId, quantity: i.productId === soda.id ? 2 : 1 })),
        { onlineOrderId: order.id }
      )
    );
    expect(sale.total.toNumber()).toBe(6.5);

    // Quitar una zona archiva su producto; renombrar conserva el mismo producto.
    const updated = await prisma.$transaction((tx) =>
      syncDeliveryZones(tx, owner.businessId, [{ name: "San Francisco", fee: 2.75, productId: zones[0].productId }])
    );
    expect(updated[0].productId).toBe(zones[0].productId);
    const removed = await prisma.product.findUniqueOrThrow({ where: { id: zones[1].productId } });
    expect(removed.archivedAt).not.toBeNull();
  });
});
