import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { batchUpdateProducts, updateProduct } from "@/server/catalog";
import { productUpdateSchema } from "@/lib/validation";
import { createOwner, hasDatabase, makeProduct, resetDatabase } from "../helpers";

describe.skipIf(!hasDatabase)("acciones en lote del inventario", () => {
  beforeEach(resetDatabase);

  it("sube el precio un porcentaje y deja el antes y el después en la bitácora", async () => {
    const owner = await createOwner();
    const a = await makeProduct(owner, { price: 10 });
    const b = await makeProduct(owner, { price: 3.95 });
    const result = await batchUpdateProducts(owner, {
      ids: [a.id, b.id],
      action: { type: "price", mode: "percent", value: 7 },
    });
    expect(result).toEqual({ updated: 2, skipped: 0 });
    const prices = await prisma.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { price: "asc" } });
    expect(prices.map((p) => Number(p.price))).toEqual([4.23, 10.7]);
    const log = await prisma.auditLog.findFirst({ where: { entityId: b.id, action: "product.update" } });
    expect(log?.details).toMatchObject({ batch: true, from: 3.95, to: 4.23 });
    expect(await prisma.auditLog.count({ where: { action: "product.batch" } })).toBe(1);
  });

  it("es todo o nada: si a uno el precio le queda en cero, no cambia ninguno", async () => {
    const owner = await createOwner();
    const a = await makeProduct(owner, { price: 10, name: "Arroz" });
    const b = await makeProduct(owner, { price: 0.5, name: "Chicle" });
    await expect(
      batchUpdateProducts(owner, { ids: [a.id, b.id], action: { type: "price", mode: "amount", value: -1 } })
    ).rejects.toThrow("El precio quedaría en cero o menos en: Chicle");
    const arroz = await prisma.product.findUniqueOrThrow({ where: { id: a.id } });
    expect(Number(arroz.price)).toBe(10);
  });

  it("categoría, stock mínimo, archivar y restaurar", async () => {
    const owner = await createOwner();
    const category = await prisma.category.create({ data: { name: "Bebidas", businessId: owner.businessId } });
    const a = await makeProduct(owner);
    const b = await makeProduct(owner);
    const ids = [a.id, b.id];

    await batchUpdateProducts(owner, { ids, action: { type: "category", categoryId: category.id } });
    await batchUpdateProducts(owner, { ids, action: { type: "minStock", value: 12 } });
    let rows = await prisma.product.findMany({ where: { id: { in: ids } } });
    expect(rows.every((p) => p.categoryId === category.id && Number(p.minStock) === 12)).toBe(true);

    await batchUpdateProducts(owner, { ids: [a.id], action: { type: "archive" } });
    expect(await batchUpdateProducts(owner, { ids, action: { type: "archive" } })).toEqual({ updated: 1, skipped: 1 });
    rows = await prisma.product.findMany({ where: { id: { in: ids } } });
    expect(rows.every((p) => p.archivedAt)).toBe(true);

    expect(await batchUpdateProducts(owner, { ids, action: { type: "restore" } })).toEqual({ updated: 2, skipped: 0 });
    await batchUpdateProducts(owner, { ids, action: { type: "category", categoryId: null } });
    rows = await prisma.product.findMany({ where: { id: { in: ids } } });
    expect(rows.every((p) => !p.archivedAt && p.categoryId === null)).toBe(true);
  });

  it("no toca productos ni categorías de otro negocio", async () => {
    const owner = await createOwner();
    const other = await createOwner();
    const mine = await makeProduct(owner, { price: 10 });
    const theirs = await makeProduct(other, { price: 10 });
    const result = await batchUpdateProducts(owner, {
      ids: [mine.id, theirs.id],
      action: { type: "price", mode: "set", value: 20 },
    });
    expect(result.updated).toBe(1);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: theirs.id } })).price)).toBe(10);

    const foreign = await prisma.category.create({ data: { name: "Ajena", businessId: other.businessId } });
    await expect(
      batchUpdateProducts(owner, { ids: [mine.id], action: { type: "category", categoryId: foreign.id } })
    ).rejects.toThrow("Categoría no encontrada");
    await expect(
      batchUpdateProducts(owner, { ids: [theirs.id], action: { type: "archive" } })
    ).rejects.toThrow("No se encontraron los productos");
  });
});

describe.skipIf(!hasDatabase)("editar un producto", () => {
  beforeEach(resetDatabase);

  it("restaurar un producto archivado conserva su costo, stock mínimo, unidad y claves SAT", async () => {
    const owner = await createOwner();
    const p = await makeProduct(owner, { cost: 6.5, minStock: 12, unit: "KG", satProductKey: "50192100", satUnitKey: "KGM" });
    await updateProduct(owner, p.id, productUpdateSchema.parse({ archived: true }));
    await updateProduct(owner, p.id, productUpdateSchema.parse({ archived: false }));
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(saved).toMatchObject({ archivedAt: null, unit: "KG", satProductKey: "50192100", satUnitKey: "KGM" });
    expect(Number(saved.cost)).toBe(6.5);
    expect(Number(saved.minStock)).toBe(12);
  });
});
