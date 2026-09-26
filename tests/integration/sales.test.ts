import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { cancelSale, createSale, returnSale } from "@/server/sales";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

describe.skipIf(!hasDatabase)("ventas", () => {
  beforeEach(resetDatabase);

  it("descuenta existencias, guarda el costo y calcula totales", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 18, cost: 12, stock: 10 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 3, discount: 4 }], { discount: 2, amountReceived: 100 }));

    expect(sale.folio).toBe(1);
    expect(sale.subtotal.toNumber()).toBe(50); // 3 × 18 − 4
    expect(sale.total.toNumber()).toBe(48);
    expect(sale.costTotal.toNumber()).toBe(36);
    expect(sale.change?.toNumber()).toBe(52);
    expect(sale.items[0].unitCost.toNumber()).toBe(12);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(7);
    const movements = await prisma.stockMovement.findMany({ where: { productId: p.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity.toNumber(), m.stockAfter.toNumber()])).toEqual([
      ["INITIAL", 10, 10],
      ["SALE", -3, 7],
    ]);
  });

  it("rechaza vender más de lo que hay", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 2 });
    await expect(createSale(owner, saleInput([{ productId: p.id, quantity: 3 }]))).rejects.toThrow(/Stock insuficiente/);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(2);
    expect(await prisma.sale.count()).toBe(0);
  });

  it("no vende la misma existencia dos veces con ventas simultáneas", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 3 });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => createSale(owner, saleInput([{ productId: p.id, quantity: 1 }])))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(0);
    const folios = (await prisma.sale.findMany({ select: { folio: true } })).map((s) => s.folio).sort();
    expect(folios).toEqual([1, 2, 3]);
  });

  it("es idempotente con clientRequestId (ventas sin conexión)", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 5 });
    const input = saleInput([{ productId: p.id, quantity: 1 }], { clientRequestId: "offline-abc-123" });
    const [a, b] = await Promise.all([createSale(owner, input), createSale(owner, input)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.sale.count()).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock.toNumber()).toBe(4);
  });

  it("solo el dueño puede cambiar el precio", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 20, stock: 5 });
    const cashier = { ...owner, role: "CASHIER" as const };
    const sale = await createSale(cashier, saleInput([{ productId: p.id, quantity: 1, unitPrice: 1 }]));
    expect(sale.total.toNumber()).toBe(20);
    const ownerSale = await createSale(owner, saleInput([{ productId: p.id, quantity: 1, unitPrice: 15 }]));
    expect(ownerSale.total.toNumber()).toBe(15);
  });

  it("aplica precio de mayoreo y permite granel", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { unit: "KG", price: 38, wholesalePrice: 34, wholesaleMinQty: 5, stock: 20 });
    const retail = await createSale(owner, saleInput([{ productId: p.id, quantity: 1.25 }]));
    expect(retail.total.toNumber()).toBe(47.5);
    const wholesale = await createSale(owner, saleInput([{ productId: p.id, quantity: 5 }]));
    expect(wholesale.total.toNumber()).toBe(170);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock.toNumber()).toBe(13.75);
  });

  it("no permite fracciones en productos por pieza", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner);
    await expect(createSale(owner, saleInput([{ productId: p.id, quantity: 0.5 }]))).rejects.toThrow(/por pieza/);
  });

  it("fiado: exige cliente, respeta el límite y actualiza el saldo", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 100, stock: 10 });
    const customer = await prisma.customer.create({ data: { name: "Doña Carmen", creditLimit: 250, businessId: owner.businessId } });

    await expect(createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "CREDIT" }))).rejects.toThrow(/cliente/);
    await createSale(owner, saleInput([{ productId: p.id, quantity: 2 }], { paymentMethod: "CREDIT", customerId: customer.id }));
    await expect(
      createSale(owner, saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: customer.id }))
    ).rejects.toThrow(/límite de crédito/);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance.toNumber()).toBe(200);
  });

  it("cancelar regresa el inventario y el saldo del fiado", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 50, stock: 10 });
    const customer = await prisma.customer.create({ data: { name: "Beto", businessId: owner.businessId } });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 4 }], { paymentMethod: "CREDIT", customerId: customer.id }));

    await cancelSale(owner, sale.id, "Error de captura");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock.toNumber()).toBe(10);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).balance.toNumber()).toBe(0);
    await expect(cancelSale(owner, sale.id, "otra vez")).rejects.toBeInstanceOf(AppError);
  });

  it("devolución parcial prorratea el descuento y no permite devolver de más", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { price: 10, cost: 6, stock: 10 });
    const sale = await createSale(owner, saleInput([{ productId: p.id, quantity: 4 }], { discount: 4 })); // total 36
    const item = sale.items[0];

    const ret = await returnSale(owner, sale.id, { items: [{ saleItemId: item.id, quantity: 2 }], reason: "Caducado", refundMethod: "CASH" });
    expect(ret.total.toNumber()).toBe(18);
    expect(ret.costTotal.toNumber()).toBe(12);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock.toNumber()).toBe(8);

    await expect(
      returnSale(owner, sale.id, { items: [{ saleItemId: item.id, quantity: 3 }], reason: null, refundMethod: "CASH" })
    ).rejects.toThrow(/Solo puedes devolver 2/);

    // Cancelar después solo regresa lo que no se devolvió.
    await cancelSale(owner, sale.id, "cliente regresó todo");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock.toNumber()).toBe(10);
  });

  it("no mezcla datos entre negocios", async () => {
    const a = await createOwner();
    const b = await createOwner();
    const p = await makeProduct(a);
    await expect(createSale(b, saleInput([{ productId: p.id, quantity: 1 }]))).rejects.toThrow(/no existe/);
  });

  it("no vende productos archivados", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner);
    await prisma.product.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
    await expect(createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]))).rejects.toThrow(/archivado/);
  });
});
