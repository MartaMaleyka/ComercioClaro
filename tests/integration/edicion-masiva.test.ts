import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bulkUpdateProducts } from "@/server/catalog";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

describe.skipIf(!hasDatabase)("edición masiva de productos", () => {
  beforeEach(resetDatabase);

  it("cambia precios, categoría y stock mínimo, archiva y avisa los errores sin detener al resto", async () => {
    const owner = await createOwner();
    const b = owner.businessId;
    const bebidas = await prisma.category.create({ data: { name: "Bebidas", businessId: b } });
    const [jugo, soda, pan] = await Promise.all(
      ["Jugo", "Soda", "Pan"].map((name) =>
        prisma.product.create({ data: { name, price: 1, cost: 0.6, minStock: 8, businessId: b } })
      )
    );
    const otro = await createOwner();
    const ajeno = await prisma.product.create({ data: { name: "Ajeno", price: 1, businessId: otro.businessId } });

    const result = await bulkUpdateProducts(owner, [
      { id: jugo.id, price: 1.25, categoryId: bebidas.id },
      { id: soda.id, minStock: 12, wholesalePrice: 0.9 },
      { id: pan.id, archived: true },
      { id: jugo.id, price: -1 },
      { id: ajeno.id, price: 9 },
    ]);
    expect(result).toMatchObject({ updated: 2, archived: 1, restored: 0 });
    expect(result.errors).toHaveLength(2);
    expect(result.errors[1]).toEqual({ id: ajeno.id, error: "Producto no encontrado" });

    const after = await prisma.product.findMany({ where: { businessId: b }, orderBy: { name: "asc" } });
    const byName = Object.fromEntries(after.map((p) => [p.name, p]));
    expect(Number(byName.Jugo.price)).toBe(1.25);
    expect(byName.Jugo.categoryId).toBe(bebidas.id);
    expect(Number(byName.Jugo.cost)).toBe(0.6);
    expect(Number(byName.Soda.minStock)).toBe(12);
    expect(Number(byName.Soda.wholesalePrice)).toBe(0.9);
    expect(byName.Pan.archivedAt).not.toBeNull();
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: ajeno.id } })).price)).toBe(1);

    const log = await prisma.auditLog.findFirst({ where: { businessId: b, action: "bulk.update" } });
    expect(log?.details).toMatchObject({ updated: 2, archived: 1, errors: 2 });

    const restore = await bulkUpdateProducts(owner, [{ id: pan.id, archived: false }]);
    expect(restore).toMatchObject({ updated: 0, restored: 1, errors: [] });
    // Archivar y restaurar no toca el resto de los datos (antes se volvían a los valores por defecto).
    const panAfter = await prisma.product.findUniqueOrThrow({ where: { id: pan.id } });
    expect(panAfter.archivedAt).toBeNull();
    expect(Number(panAfter.cost)).toBe(0.6);
    expect(Number(panAfter.minStock)).toBe(8);
  });
});
