import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/server/account";
import { createSale } from "@/server/sales";
import { addCustomerPayment, customersAging } from "@/server/customers";
import { financialSummary } from "@/server/reports";
import { dgiFreeInvoicerStatus, registerExternalInvoice } from "@/server/dgi";
import { cancelInvoice } from "@/server/invoices";
import { cancelSale } from "@/server/sales";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function panamaOwner() {
  const { user, businessId } = await registerAccount({
    email: `pa-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Wei",
    businessName: "Minisúper",
    country: "PA",
  });
  return { userId: user.id, businessId, role: "OWNER" as const };
}

describe.skipIf(!hasDatabase)("Panamá", () => {
  beforeEach(resetDatabase);

  it("el registro con país Panamá configura B/., zona horaria e ITBMS por defecto", async () => {
    const owner = await panamaOwner();
    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    expect(business).toMatchObject({ country: "PA", currency: "USD", locale: "es-PA", timezone: "America/Panama", showBalboa: true });
    const p = await makeProduct(owner, { taxRate: undefined });
    expect(p.taxRate.toNumber()).toBe(0.07);
    const beer = await makeProduct(owner, { taxRate: 0.1, packSize: 24 });
    expect(beer.packSize).toBe(24);
  });

  it("venta con Yappy guarda la referencia y estima la comisión", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 10, cost: 6, stock: 10, taxRate: 0.07 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 10 }], { paymentMethod: "YAPPY", paymentReference: "884512" }));
    expect(sale.paymentReference).toBe("884512");

    // La referencia no se guarda en efectivo.
    const p2 = await makeProduct(owner, { price: 5, stock: 5 });
    const cash = await createSale(owner, saleInput([{ productId: p2.id, quantity: 1 }], { paymentReference: "x" }));
    expect(cash.paymentReference).toBeNull();

    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const summary = await financialSummary(
      owner.businessId,
      { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + 60_000) },
      business
    );
    expect(summary.fees.total.toNumber()).toBe(1.07); // 1.07% de B/.100
    expect(summary.netAfterFees.toNumber()).toBe(summary.netProfit.toNumber() - 1.07);
  });

  it("el fiado vence según los días de crédito y los abonos se aplican FIFO", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 10, stock: 20 });
    const customer = await prisma.customer.create({ data: { name: "Maritza", creditDays: 15, businessId: owner.businessId } });

    const old = await createSale(owner, saleInput([{ productId: p.id, quantity: 3 }], { paymentMethod: "CREDIT", customerId: customer.id }));
    expect(Math.round((old.dueDate!.getTime() - old.createdAt.getTime()) / 86_400_000)).toBe(15);
    // Simula que la venta fue hace 20 días.
    const twentyDaysAgo = new Date(Date.now() - 20 * 86_400_000);
    await prisma.sale.update({
      where: { id: old.id },
      data: { createdAt: twentyDaysAgo, dueDate: new Date(twentyDaysAgo.getTime() + 15 * 86_400_000) },
    });
    await createSale(owner, saleInput([{ productId: p.id, quantity: 2 }], { paymentMethod: "CREDIT", customerId: customer.id }));
    await addCustomerPayment(owner, customer.id, { amount: 10, method: "YAPPY", notes: null });

    const aging = (await customersAging(owner.businessId)).get(customer.id)!;
    expect(aging.balance).toBe(40);
    expect(aging.overdue).toBe(20);
    expect(aging.daysOverdue).toBe(5);
  });

  it("registra el CUFE, cuenta documentos del mes y libera la venta al anular", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 100, stock: 10 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 2 }]));

    const cufe = "FE0120000155678901-2-2021-0001";
    const invoice = await registerExternalInvoice(owner, { saleId: sale.id, cufe });
    expect(invoice).toMatchObject({ provider: "dgi", status: "STAMPED", uuid: cufe });
    await expect(registerExternalInvoice(owner, { saleId: sale.id, cufe: "OTRO1234567" })).rejects.toThrow(/ya tiene/);

    const other = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    await expect(registerExternalInvoice(owner, { saleId: other.id, cufe })).rejects.toThrow(/ya está registrado/);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const status = await dgiFreeInvoicerStatus(business);
    expect(status).toMatchObject({ documents: 1, monthSales: 2, revenue: 300, status: "ok" });

    // Con factura registrada no se puede cancelar la venta; al anular la factura sí.
    await expect(cancelSale(owner, sale.id, "error")).rejects.toThrow(/facturada/);
    await cancelInvoice(owner, invoice.id);
    await cancelSale(owner, sale.id, "error");
  });

  it("avisa al acercarse y al superar el límite anual de B/.36,000", async () => {
    const owner = await panamaOwner();
    const p = await makeProduct(owner, { price: 1000, stock: 100 });
    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });

    await createSale(owner, saleInput([{ productId: p.id, quantity: 30 }]));
    expect((await dgiFreeInvoicerStatus(business)).status).toBe("warning");
    await createSale(owner, saleInput([{ productId: p.id, quantity: 7 }]));
    const exceeded = await dgiFreeInvoicerStatus(business);
    expect(exceeded.status).toBe("exceeded");
    expect(exceeded.revenueRatio).toBeGreaterThan(1);
  });
});
