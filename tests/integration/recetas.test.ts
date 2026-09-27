import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cancelSale, createSale, returnSale } from "@/server/sales";
import { adjustStock, reorderSuggestions } from "@/server/inventory";
import { getRecipe, ingredientsOverview, saveRecipe, wasteReport } from "@/server/recipes";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function stockOf(id: string) {
  return (await prisma.product.findUniqueOrThrow({ where: { id } })).stock.toNumber();
}

describe.skipIf(!hasDatabase)("recetas e insumos", () => {
  beforeEach(resetDatabase);

  async function kitchen() {
    const owner = await createOwner();
    const chicken = await makeProduct(owner, { name: "Pollo", unit: "LB", cost: 2, stock: 10, isIngredient: true });
    const rice = await makeProduct(owner, { name: "Arroz", unit: "LB", cost: 0.5, stock: 20, isIngredient: true });
    const dish = await makeProduct(owner, { name: "Pollo con arroz", price: 5, cost: 0, stock: 0 });
    // La receta rinde 4 porciones: 2 lb de pollo y 1 lb de arroz.
    await saveRecipe(owner, dish.id, {
      recipeYield: 4,
      items: [
        { ingredientId: chicken.id, quantity: 2 },
        { ingredientId: rice.id, quantity: 1 },
      ],
    });
    return { owner, chicken, rice, dish };
  }

  it("la venta de un plato descuenta sus insumos y toma su costo", async () => {
    const { owner, chicken, rice, dish } = await kitchen();
    const recipe = await getRecipe(owner.businessId, dish.id);
    // Por porción: 0.5 lb de pollo ($1.00) + 0.25 lb de arroz ($0.125).
    expect(recipe.cost.toNumber()).toBe(1.13);
    expect(recipe.margin?.toNumber()).toBe(77.4);
    expect(recipe.available?.toNumber()).toBe(20);

    const sale = await createSale(owner, saleInput([{ productId: dish.id, quantity: 3 }]));
    expect(await stockOf(chicken.id)).toBe(8.5);
    expect(await stockOf(rice.id)).toBe(19.25);
    // El plato no lleva existencias propias.
    expect(await stockOf(dish.id)).toBe(0);
    expect(sale.costTotal.toNumber()).toBe(3.38);

    const moves = await prisma.stockMovement.findMany({ where: { referenceId: sale.id, type: "SALE" } });
    expect(moves.map((m) => m.productId).sort()).toEqual([chicken.id, rice.id].sort());
  });

  it("cancelar y devolver regresan los insumos", async () => {
    const { owner, chicken, rice, dish } = await kitchen();
    const sale = await createSale(owner, saleInput([{ productId: dish.id, quantity: 4 }]));
    expect(await stockOf(chicken.id)).toBe(8);

    await returnSale(owner, sale.id, {
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
      reason: "Frío",
      refundMethod: "CASH",
    });
    expect(await stockOf(chicken.id)).toBe(8.5);
    expect(await stockOf(rice.id)).toBe(19.25);

    await cancelSale(owner, sale.id, "Error");
    expect(await stockOf(chicken.id)).toBe(10);
    expect(await stockOf(rice.id)).toBe(20);
  });

  it("los insumos no se venden en la caja y pueden quedar en negativo", async () => {
    const { owner, chicken, dish } = await kitchen();
    await expect(createSale(owner, saleInput([{ productId: chicken.id, quantity: 1 }]))).rejects.toThrow(/insumo/);
    await createSale(owner, saleInput([{ productId: dish.id, quantity: 24 }]));
    expect(await stockOf(chicken.id)).toBe(-2);
  });

  it("sin la función de recetas en el plan, el plato se vende sin descontar insumos", async () => {
    const { owner, chicken, dish } = await kitchen();
    await createSale({ ...owner, features: [] }, saleInput([{ productId: dish.id, quantity: 2 }]));
    expect(await stockOf(chicken.id)).toBe(10);
  });

  it("valida la receta", async () => {
    const { owner, chicken, dish } = await kitchen();
    await expect(
      saveRecipe(owner, dish.id, { recipeYield: null, items: [{ ingredientId: dish.id, quantity: 1 }] })
    ).rejects.toThrow(/sí mismo/);
    await expect(
      saveRecipe(owner, chicken.id, { recipeYield: null, items: [{ ingredientId: dish.id, quantity: 1 }] })
    ).rejects.toThrow(/insumo no puede tener receta/);
    const other = await createOwner();
    const foreign = await makeProduct(other, { stock: 5 });
    await expect(
      saveRecipe(owner, dish.id, { recipeYield: null, items: [{ ingredientId: foreign.id, quantity: 1 }] })
    ).rejects.toThrow(/no existe/);
    // Sin insumos se borra la receta.
    await saveRecipe(owner, dish.id, { recipeYield: null, items: [] });
    expect((await getRecipe(owner.businessId, dish.id)).items).toEqual([]);
  });

  it("qué comprar cuenta lo que consumen los platos y la merma se valora a costo", async () => {
    const { owner, chicken, dish } = await kitchen();
    await prisma.product.update({ where: { id: chicken.id }, data: { minStock: 3 } });
    await createSale(owner, saleInput([{ productId: dish.id, quantity: 16 }]));
    const suggestions = await reorderSuggestions(owner.businessId);
    const pollo = suggestions.find((s) => s.productId === chicken.id);
    expect(pollo?.avgDailySales.toNumber()).toBeCloseTo(8 / 30, 3);
    expect(pollo?.isIngredient).toBe(true);

    await adjustStock(owner, chicken.id, { mode: "delta", quantity: -1.5, reason: "WASTE", notes: "Se echó a perder" });
    await adjustStock(owner, chicken.id, { mode: "delta", quantity: 1, reason: "COUNT", notes: null });
    const waste = await wasteReport(owner.businessId, {
      start: new Date(Date.now() - 60_000),
      end: new Date(Date.now() + 60_000),
    });
    expect(waste.total.toNumber()).toBe(3);
    expect(waste.products[0].quantity.toNumber()).toBe(1.5);

    const overview = await ingredientsOverview(owner.businessId);
    expect(overview.ingredients.map((i) => i.name)).toEqual(["Arroz", "Pollo"]);
    expect(overview.dishes[0]).toMatchObject({ name: "Pollo con arroz", ingredients: 2 });
  });
});
