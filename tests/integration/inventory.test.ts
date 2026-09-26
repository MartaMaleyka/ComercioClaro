import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPurchase, cancelPurchase } from "@/server/purchases";
import { createSale } from "@/server/sales";
import { adjustStock, reorderSuggestions } from "@/server/inventory";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const purchase = (items: { productId: string; quantity: number; unitCost: number; expiresAt?: Date }[]) => ({
  items: items.map((i) => ({ lotCode: null, expiresAt: null, ...i })),
  supplierId: null,
  supplierName: "Distribuidora",
  notes: null,
  paidFromCash: false,
});

describe.skipIf(!hasDatabase)("inventario y compras", () => {
  beforeEach(resetDatabase);

  it("la compra suma existencias y recalcula el costo promedio", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 48, cost: 12 });
    const buy = await createPurchase(owner, purchase([{ productId: p.id, quantity: 24, unitCost: 12.5 }]));
    expect(buy.total.toNumber()).toBe(300);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(72);
    expect(after.cost.toFixed(4)).toBe("12.1667");
  });

  it("no cancela una compra cuya mercancía ya se vendió", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 0 });
    const buy = await createPurchase(owner, purchase([{ productId: p.id, quantity: 5, unitCost: 6 }]));
    await createSale(owner, saleInput([{ productId: p.id, quantity: 3 }]));
    await expect(cancelPurchase(owner, buy.id, "error")).rejects.toThrow(/Stock insuficiente/);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(2);
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: buy.id } })).status).toBe("ACTIVE");
  });

  it("cancelar una compra retira la mercancía y revierte el costo", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 10, cost: 10 });
    const buy = await createPurchase(owner, purchase([{ productId: p.id, quantity: 10, unitCost: 20 }]));
    await cancelPurchase(owner, buy.id, "proveedor equivocado");
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.stock.toNumber()).toBe(10);
    expect(after.cost.toNumber()).toBe(10);
  });

  it("consume lotes por fecha de caducidad (FEFO)", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 0, trackExpiry: true });
    const soon = new Date(Date.now() + 3 * 86400000);
    const later = new Date(Date.now() + 30 * 86400000);
    await createPurchase(owner, purchase([{ productId: p.id, quantity: 5, unitCost: 5, expiresAt: later }]));
    await createPurchase(owner, purchase([{ productId: p.id, quantity: 5, unitCost: 5, expiresAt: soon }]));
    await createSale(owner, saleInput([{ productId: p.id, quantity: 6 }]));
    const batches = await prisma.productBatch.findMany({ where: { productId: p.id }, orderBy: { expiresAt: "asc" } });
    expect(batches.map((b) => b.remaining.toNumber())).toEqual([0, 4]);
  });

  it("ajuste por conteo físico registra el motivo en el kardex", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { stock: 10 });
    await adjustStock(owner, p.id, { mode: "set", quantity: 7, reason: "COUNT", notes: "inventario mensual" });
    await adjustStock(owner, p.id, { mode: "delta", quantity: -2, reason: "WASTE", notes: null });
    const movements = await prisma.stockMovement.findMany({ where: { productId: p.id, type: "ADJUSTMENT" }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.quantity.toNumber(), m.reason])).toEqual([
      [-3, "COUNT"],
      [-2, "WASTE"],
    ]);
    await expect(adjustStock(owner, p.id, { mode: "delta", quantity: -50, reason: "THEFT", notes: null })).rejects.toThrow(/Stock insuficiente/);
  });

  it("sugiere reabastecer productos bajo el mínimo", async () => {
    const owner = await createOwner();
    const low = await makeProduct(owner, { stock: 1, minStock: 5 });
    await makeProduct(owner, { stock: 100, minStock: 5 });
    const suggestions = await reorderSuggestions(owner.businessId);
    expect(suggestions.map((s) => s.productId)).toEqual([low.id]);
    expect(suggestions[0].suggestedQuantity.toNumber()).toBe(9);
  });
});
