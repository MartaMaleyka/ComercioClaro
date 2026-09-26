import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/server/account";
import { cancelSale, createSale } from "@/server/sales";
import { issueSaleInvoice, retryPendingInvoices } from "@/server/einvoice/service";
import { dgiFreeInvoicerStatus } from "@/server/dgi";
import { createYappyCharge, getYappyCharge } from "@/server/yappy";
import { applyCount, recordCount, startCount } from "@/server/counts";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function panamaOwner(settings: Record<string, unknown> = {}) {
  const { user, businessId } = await registerAccount({
    email: `r3-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Wei",
    businessName: "Minisúper",
    country: "PA",
  });
  await prisma.business.update({ where: { id: businessId }, data: { ruc: "8-812-2345", dv: "45", ...settings } });
  return { userId: user.id, businessId, role: "OWNER" as const };
}

describe.skipIf(!hasDatabase)("factura automática con PAC", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    delete process.env.PAC_SIMULATE_OUTAGE;
  });

  it("emite con el PAC simulado y guarda el CUFE", async () => {
    const owner = await panamaOwner({ einvoiceMode: "PAC", einvoiceProvider: "simulado" });
    const p = await makeProduct(owner, { price: 10.7, taxRate: 0.07 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    const invoice = await issueSaleInvoice(owner, sale.id);
    expect(invoice.status).toBe("STAMPED");
    expect(invoice.uuid).toMatch(/^PRUEBA-FE01-8-812-2345-0000000001-/);
    await expect(issueSaleInvoice(owner, sale.id)).rejects.toThrow(/ya tiene factura/);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const status = await dgiFreeInvoicerStatus(business);
    expect(status).toMatchObject({ documentsBasis: "pac", documents: 1 });
  });

  it("si el PAC está caído queda en contingencia y se reintenta", async () => {
    const owner = await panamaOwner({ einvoiceMode: "PAC", einvoiceProvider: "simulado" });
    const p = await makeProduct(owner, { price: 5, taxRate: 0 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));

    process.env.PAC_SIMULATE_OUTAGE = "true";
    const pending = await issueSaleInvoice(owner, sale.id);
    expect(pending.status).toBe("PENDING");
    expect(pending.error).toMatch(/Contingencia/);
    expect(pending.nextAttemptAt).not.toBeNull();

    delete process.env.PAC_SIMULATE_OUTAGE;
    const result = await retryPendingInvoices(owner.businessId, true);
    expect(result).toMatchObject({ processed: 1, stamped: 1 });
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: pending.id } });
    expect(invoice.status).toBe("STAMPED");
  });

  it("sin RUC del negocio la factura se rechaza y la venta queda libre", async () => {
    const owner = await panamaOwner({ einvoiceMode: "PAC", einvoiceProvider: "simulado", ruc: null });
    const p = await makeProduct(owner, { price: 5, taxRate: 0 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    const invoice = await issueSaleInvoice(owner, sale.id);
    expect(invoice.status).toBe("ERROR");
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).invoiceId).toBeNull();
  });

  it("con 'factura por venta' cuenta ventas y devoluciones como documentos", async () => {
    const owner = await panamaOwner({ invoicePerSale: true });
    const p = await makeProduct(owner, { price: 1, stock: 10 });
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    expect(await dgiFreeInvoicerStatus(business)).toMatchObject({ documentsBasis: "perSale", documents: 2 });
  });
});

describe.skipIf(!hasDatabase)("Yappy con confirmación automática", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.YAPPY_SIMULATED_DELAY_MS = "0";
  });
  afterEach(() => {
    delete process.env.YAPPY_SIMULATED_DELAY_MS;
  });

  it("la venta usa el cobro confirmado una sola vez y por el monto exacto", async () => {
    const owner = await panamaOwner({ yappyMode: "API" });
    const p = await makeProduct(owner, { price: 2.1, stock: 10 });

    await expect(createYappyCharge(owner, { amount: 2.1, phone: "12345" })).rejects.toThrow(/celular/);
    const charge = await createYappyCharge(owner, { amount: 2.1, phone: "6123-4567" });
    expect(charge.status).toBe("PENDING");

    // Antes de confirmarse no se puede registrar la venta.
    process.env.YAPPY_SIMULATED_DELAY_MS = "60000";
    await expect(
      createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "YAPPY", yappyChargeId: charge.id }))
    ).rejects.toThrow(/no está confirmado/);

    process.env.YAPPY_SIMULATED_DELAY_MS = "0";
    expect((await getYappyCharge(owner.businessId, charge.id)).status).toBe("PAID");
    await expect(
      createSale(owner, saleInput([{ productId: p.id, quantity: 2 }], { paymentMethod: "YAPPY", yappyChargeId: charge.id }))
    ).rejects.toThrow(/no coincide/);

    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "YAPPY", yappyChargeId: charge.id }));
    expect(sale.paymentReference).toBe(charge.providerTxId);
    await expect(
      createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "YAPPY", yappyChargeId: charge.id }))
    ).rejects.toThrow(/ya se usó/);
  });

  it("rechaza números que la pasarela declina", async () => {
    const owner = await panamaOwner({ yappyMode: "API" });
    const charge = await createYappyCharge(owner, { amount: 1, phone: "6000-0000" });
    expect((await getYappyCharge(owner.businessId, charge.id)).status).toBe("FAILED");
  });
});

describe.skipIf(!hasDatabase)("promociones y puntos", () => {
  beforeEach(resetDatabase);

  it("aplica el 2x1 en el servidor y lo guarda en el renglón", async () => {
    const owner = await panamaOwner();
    const beer = await makeProduct(owner, { price: 1.1, stock: 24, taxRate: 0.1 });
    await prisma.promotion.create({
      data: { name: "2x1 cerveza", type: "BUY_X_PAY_Y", buyQty: 2, payQty: 1, productId: beer.id, businessId: owner.businessId },
    });
    const sale = await createSale(owner, saleInput([{ productId: beer.id, quantity: 5 }]));
    expect(sale.total.toNumber()).toBe(3.3);
    expect(sale.items[0].promotionDiscount.toNumber()).toBe(2.2);
  });

  it("gana, canjea y revierte puntos al cancelar", async () => {
    const owner = await panamaOwner({ loyaltyEnabled: true, loyaltyPointsPerUnit: 1, loyaltyPointValue: 0.01 });
    const p = await makeProduct(owner, { price: 25, stock: 20 });
    const customer = await prisma.customer.create({ data: { name: "Maritza", businessId: owner.businessId } });

    const first = await createSale(owner, saleInput([{ productId: p.id, quantity: 4 }], { customerId: customer.id }));
    expect(first.pointsEarned).toBe(100);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(100);

    const second = await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { customerId: customer.id, redeemPoints: 100 }));
    expect(second.pointsDiscount.toNumber()).toBe(1);
    expect(second.total.toNumber()).toBe(24);
    expect(second.pointsEarned).toBe(24);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(24);

    await expect(
      createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { customerId: customer.id, redeemPoints: 500 }))
    ).rejects.toThrow(/solo tiene/);

    await cancelSale(owner, second.id, "error");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).points).toBe(100);
  });
});

describe.skipIf(!hasDatabase)("conteo físico", () => {
  beforeEach(resetDatabase);

  it("ajusta solo los productos contados", async () => {
    const owner = await panamaOwner();
    const a = await makeProduct(owner, { stock: 10, barcode: "7451001000042" });
    const b = await makeProduct(owner, { stock: 5 });
    const count = await startCount(owner, null);
    expect((await startCount(owner, null)).id).toBe(count.id);

    await recordCount(owner, count.id, { barcode: "7451001000042", quantity: 1, mode: "add" });
    await recordCount(owner, count.id, { barcode: "7451001000042", quantity: 1, mode: "add" });
    await recordCount(owner, count.id, { productId: a.id, quantity: 8, mode: "set" });
    await expect(recordCount(owner, count.id, { barcode: "no-existe", quantity: 1, mode: "add" })).rejects.toThrow(/No hay producto/);

    const result = await applyCount(owner, count.id);
    expect(result).toEqual({ lines: 1, adjusted: 1 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).stock.toNumber()).toBe(8);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: b.id } })).stock.toNumber()).toBe(5);
    const movement = await prisma.stockMovement.findFirst({ where: { productId: a.id, type: "ADJUSTMENT" } });
    expect(movement).toMatchObject({ reason: "COUNT", referenceId: count.id });
    await expect(applyCount(owner, count.id)).rejects.toThrow(/no está abierto/);
  });
});
