import { AppError, notFound } from "@/lib/errors";
import { D, money, qty, sum, unitCost, type Decimal } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "./inventory";

type Db = Tx | typeof prisma;

export interface RecipeInput {
  recipeYield: number | null;
  items: { ingredientId: string; quantity: number }[];
}

/** Rendimiento de la receta: sin indicar (o 0) rinde una porción. */
function yieldOf(product: { recipeYield: Decimal | null }) {
  const y = D(product.recipeYield);
  return y.gt(0) ? y : D(1);
}

/** Receta de un plato con el costo actual de cada insumo. */
export async function getRecipe(businessId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
    select: {
      id: true,
      name: true,
      price: true,
      recipeYield: true,
      recipeItems: {
        include: { ingredient: { select: { id: true, name: true, unit: true, cost: true, stock: true } } },
        orderBy: { ingredient: { name: "asc" } },
      },
    },
  });
  if (!product) throw notFound("Producto");
  const portions = yieldOf(product);
  const items = product.recipeItems.map((r) => {
    const perPortion = D(r.quantity).div(portions);
    return {
      ingredientId: r.ingredientId,
      name: r.ingredient.name,
      unit: r.ingredient.unit,
      quantity: D(r.quantity),
      unitCost: D(r.ingredient.cost),
      cost: money(perPortion.times(r.ingredient.cost)),
      // Porciones que alcanzan con la existencia de este insumo
      portions: perPortion.gt(0) ? D(r.ingredient.stock).div(perPortion).floor() : null,
    };
  });
  const cost = money(sum(items.map((i) => D(i.quantity).div(portions).times(i.unitCost))));
  const price = D(product.price);
  const available = items.length > 0 ? minOf(items.map((i) => i.portions ?? D(0))) : null;
  return {
    productId: product.id,
    recipeYield: product.recipeYield,
    items,
    cost,
    margin: price.gt(0) && items.length > 0 ? price.minus(cost).div(price).times(100).toDecimalPlaces(1) : null,
    available: available && available.lt(0) ? D(0) : available,
  };
}

function minOf(values: Decimal[]) {
  return values.reduce((acc, v) => (v.lt(acc) ? v : acc));
}

/**
 * Guarda la receta completa de un plato (reemplaza la anterior). El plato deja de llevar
 * existencias propias: al venderse se descuentan sus insumos. Sin insumos, se borra la receta.
 */
export async function saveRecipe(actor: Actor, productId: string, input: RecipeInput) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, businessId: actor.businessId } });
    if (!product) throw notFound("Producto");
    if (product.isIngredient) throw new AppError(400, "Un insumo no puede tener receta");

    const ids = input.items.map((i) => i.ingredientId);
    if (new Set(ids).size !== ids.length) throw new AppError(400, "Hay insumos repetidos en la receta");
    if (ids.includes(productId)) throw new AppError(400, "Un plato no puede ser insumo de sí mismo");
    const ingredients = await tx.product.findMany({
      where: { id: { in: ids }, businessId: actor.businessId, archivedAt: null },
      include: { _count: { select: { recipeItems: true } } },
    });
    if (ingredients.length !== ids.length) throw new AppError(404, "Uno de los insumos no existe o está archivado");
    for (const ingredient of ingredients) {
      if (!ingredient.trackStock) {
        throw new AppError(400, `${ingredient.name} no lleva existencias y no puede ser insumo`);
      }
      if (ingredient._count.recipeItems > 0) {
        throw new AppError(400, `${ingredient.name} tiene su propia receta y no puede ser insumo`);
      }
    }

    await tx.recipeItem.deleteMany({ where: { productId } });
    if (input.items.length > 0) {
      await tx.recipeItem.createMany({
        data: input.items.map((i) => ({
          productId,
          ingredientId: i.ingredientId,
          quantity: D(i.quantity).toDecimalPlaces(4),
          businessId: actor.businessId,
        })),
      });
    }
    // El costo del plato queda como referencia; al vender se toma el costo vigente de los insumos.
    const costMap = new Map(ingredients.map((i) => [i.id, D(i.cost)]));
    const portions = input.recipeYield && input.recipeYield > 0 ? D(input.recipeYield) : D(1);
    const cost = sum(input.items.map((i) => D(i.quantity).div(portions).times(costMap.get(i.ingredientId)!)));
    await tx.product.update({
      where: { id: productId },
      data: {
        recipeYield: input.items.length > 0 && input.recipeYield ? qty(input.recipeYield) : null,
        ...(input.items.length > 0 ? { trackStock: false, cost: unitCost(cost) } : {}),
      },
    });
    await audit(tx, actor, "recipe.save", "Product", productId, {
      items: input.items.length,
      recipeYield: input.recipeYield,
    });
    return input.items.length;
  });
}

export interface RecipeLine {
  ingredientId: string;
  /** Cantidad del insumo por cada unidad vendida del plato */
  perUnit: Decimal;
}

/** Recetas de los platos indicados: platoId → insumos por unidad vendida. */
export async function recipesFor(db: Db, businessId: string, productIds: string[]) {
  const rows = await db.recipeItem.findMany({
    where: { businessId, productId: { in: productIds } },
    include: { product: { select: { recipeYield: true } } },
  });
  const map = new Map<string, RecipeLine[]>();
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ ingredientId: r.ingredientId, perUnit: D(r.quantity).div(yieldOf(r.product)) });
    map.set(r.productId, list);
  }
  return map;
}

/** Insumos y platos con receta: existencias, costo por plato y margen. */
export async function ingredientsOverview(businessId: string) {
  const [ingredients, dishes] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, archivedAt: null, OR: [{ isIngredient: true }, { usedInRecipes: { some: {} } }] },
      select: {
        id: true,
        name: true,
        unit: true,
        stock: true,
        minStock: true,
        cost: true,
        isIngredient: true,
        _count: { select: { usedInRecipes: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { businessId, archivedAt: null, recipeItems: { some: {} } },
      select: { id: true, name: true, price: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const recipes = await Promise.all(dishes.map((d) => getRecipe(businessId, d.id)));
  return {
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      stock: i.stock,
      minStock: i.minStock,
      cost: i.cost,
      isIngredient: i.isIngredient,
      recipes: i._count.usedInRecipes,
      low: D(i.stock).lte(i.minStock),
    })),
    dishes: recipes.map((r, i) => ({
      id: r.productId,
      name: dishes[i].name,
      price: dishes[i].price,
      cost: r.cost,
      margin: r.margin,
      available: r.available,
      ingredients: r.items.length,
    })),
  };
}

/** Motivos que cuentan como merma: desperdicio, caducidad y daño. */
export const WASTE_REASONS = ["WASTE", "EXPIRED", "DAMAGED"] as const;

/** Merma de un periodo valorada al costo registrado en el movimiento. */
export async function wasteReport(businessId: string, range: { start: Date; end: Date }) {
  const moves = await prisma.stockMovement.findMany({
    where: {
      businessId,
      type: "ADJUSTMENT",
      reason: { in: [...WASTE_REASONS] },
      quantity: { lt: 0 },
      createdAt: { gte: range.start, lt: range.end },
    },
    include: { product: { select: { id: true, name: true, unit: true, isIngredient: true } } },
  });
  const byProduct = new Map<
    string,
    { productId: string; name: string; unit: string; isIngredient: boolean; quantity: Decimal; value: Decimal }
  >();
  const byReason = new Map<string, Decimal>();
  for (const m of moves) {
    const quantity = D(m.quantity).abs();
    const value = money(quantity.times(D(m.unitCost)));
    const row = byProduct.get(m.productId) ?? {
      productId: m.productId,
      name: m.product.name,
      unit: m.product.unit,
      isIngredient: m.product.isIngredient,
      quantity: D(0),
      value: D(0),
    };
    row.quantity = row.quantity.plus(quantity);
    row.value = row.value.plus(value);
    byProduct.set(m.productId, row);
    byReason.set(m.reason!, (byReason.get(m.reason!) ?? D(0)).plus(value));
  }
  const products = [...byProduct.values()].sort((a, b) => b.value.comparedTo(a.value));
  return {
    total: money(sum(products.map((p) => p.value))),
    products,
    byReason: [...byReason.entries()].map(([reason, value]) => ({ reason, value: money(value) })),
  };
}
