import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { D, money, qty, unitCost } from "@/lib/decimal";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { productCreateSchema } from "@/lib/validation";
import { applyStockChange, type Actor } from "./inventory";
import { countryConfig } from "@/lib/country";
import { assertWithinLimit } from "./limits";
import type { ProductBatchInput } from "@/lib/product-batch";

export type ProductInput = z.infer<typeof productCreateSchema>;

async function assertCategory(businessId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({ where: { id: categoryId, businessId } });
  if (!category) throw new AppError(404, "Categoría no encontrada");
}

async function defaultTaxRate(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { country: true } });
  return countryConfig(business.country).defaultTaxRate;
}

export async function createProduct(actor: Actor, input: ProductInput) {
  await assertCategory(actor.businessId, input.categoryId);
  const taxRate = input.taxRate ?? (await defaultTaxRate(actor.businessId));
  return prisma.$transaction(async (tx) => {
    await assertWithinLimit(tx, actor, "products");
    const product = await tx.product.create({
      data: {
        name: input.name,
        description: input.description,
        sku: input.sku,
        barcode: input.barcode,
        unit: input.unit,
        price: money(input.price),
        wholesalePrice: input.wholesalePrice != null ? money(input.wholesalePrice) : null,
        wholesaleMinQty: input.wholesaleMinQty != null ? qty(input.wholesaleMinQty) : null,
        cost: unitCost(input.cost),
        minStock: qty(input.minStock),
        trackExpiry: input.trackExpiry,
        packSize: input.packSize ?? null,
        taxRate: D(taxRate),
        iepsRate: D(input.iepsRate),
        satProductKey: input.satProductKey,
        satUnitKey: input.satUnitKey,
        categoryId: input.categoryId ?? null,
        variantGroup: input.variantGroup ?? null,
        sendToKitchen: input.sendToKitchen ?? false,
        trackStock: input.trackStock ?? true,
        seniorEligible: input.seniorEligible ?? true,
        isIngredient: input.isIngredient ?? false,
        variantLabel: input.variantLabel ?? null,
        ...(input.modifiers?.length ? { modifiers: input.modifiers } : {}),
        businessId: actor.businessId,
      },
    });
    if (input.stock > 0 && input.trackStock !== false) {
      await applyStockChange(tx, actor, {
        productId: product.id,
        delta: input.stock,
        type: "INITIAL",
        unitCost: input.cost,
      });
      if (input.trackExpiry) {
        await tx.productBatch.create({
          data: {
            quantity: qty(input.stock),
            remaining: qty(input.stock),
            productId: product.id,
            businessId: actor.businessId,
          },
        });
      }
    }
    await audit(tx, actor, "product.create", "Product", product.id, { name: product.name });
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: { category: true } });
  });
}

export async function updateProduct(
  actor: Actor,
  id: string,
  input: Partial<Omit<ProductInput, "stock">> & { archived?: boolean }
) {
  const existing = await prisma.product.findFirst({ where: { id, businessId: actor.businessId } });
  if (!existing) throw new AppError(404, "Producto no encontrado");
  await assertCategory(actor.businessId, input.categoryId);

  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.sku !== undefined) data.sku = input.sku;
  if (input.barcode !== undefined) data.barcode = input.barcode;
  if (input.unit !== undefined) data.unit = input.unit;
  if (input.price !== undefined) data.price = money(input.price);
  if (input.wholesalePrice !== undefined)
    data.wholesalePrice = input.wholesalePrice != null ? money(input.wholesalePrice) : null;
  if (input.wholesaleMinQty !== undefined)
    data.wholesaleMinQty = input.wholesaleMinQty != null ? qty(input.wholesaleMinQty) : null;
  if (input.cost !== undefined) data.cost = unitCost(input.cost);
  if (input.minStock !== undefined) data.minStock = qty(input.minStock);
  if (input.trackExpiry !== undefined) data.trackExpiry = input.trackExpiry;
  if (input.packSize !== undefined) data.packSize = input.packSize ?? null;
  if (input.taxRate != null) data.taxRate = D(input.taxRate);
  if (input.iepsRate !== undefined) data.iepsRate = D(input.iepsRate);
  if (input.satProductKey !== undefined) data.satProductKey = input.satProductKey;
  if (input.satUnitKey !== undefined) data.satUnitKey = input.satUnitKey;
  if (input.categoryId !== undefined) {
    data.category = input.categoryId ? { connect: { id: input.categoryId } } : { disconnect: true };
  }
  if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
  if (input.variantGroup !== undefined) data.variantGroup = input.variantGroup;
  if (input.sendToKitchen !== undefined) data.sendToKitchen = input.sendToKitchen;
  if (input.trackStock !== undefined) data.trackStock = input.trackStock;
  if (input.seniorEligible !== undefined) data.seniorEligible = input.seniorEligible;
  if (input.isIngredient !== undefined) data.isIngredient = input.isIngredient;
  if (input.variantLabel !== undefined) data.variantLabel = input.variantLabel;
  if (input.modifiers !== undefined) data.modifiers = input.modifiers?.length ? input.modifiers : Prisma.DbNull;

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data, include: { category: true } });
    await audit(tx, actor, input.archived ? "product.archive" : "product.update", "Product", id, {
      fields: Object.keys(input),
    });
    return product;
  });
}

const BATCH_ACTION: Record<ProductBatchInput["action"]["type"], string> = {
  price: "product.update",
  category: "product.update",
  minStock: "product.update",
  archive: "product.archive",
  restore: "product.update",
};

/**
 * Acción en lote sobre varios productos. Es todo o nada: si a algún producto el precio le quedaría
 * en cero o menos, no se cambia ninguno. Cada producto deja su entrada en la bitácora.
 */
export async function batchUpdateProducts(actor: Actor, input: ProductBatchInput) {
  const { action } = input;
  const ids = [...new Set(input.ids)];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, businessId: actor.businessId },
    select: { id: true, name: true, price: true, archivedAt: true },
  });
  if (products.length === 0) throw new AppError(404, "No se encontraron los productos");
  if (action.type === "category") await assertCategory(actor.businessId, action.categoryId);

  const prices = new Map<string, Prisma.Decimal>();
  if (action.type === "price") {
    const invalid: string[] = [];
    for (const p of products) {
      const next =
        action.mode === "set"
          ? money(action.value)
          : action.mode === "percent"
            ? money(D(p.price).times(D(action.value).div(100).plus(1)))
            : money(D(p.price).plus(action.value));
      if (action.mode !== "set" && next.lte(0)) invalid.push(p.name);
      prices.set(p.id, next);
    }
    if (invalid.length > 0) {
      const names = invalid.slice(0, 3).join(", ") + (invalid.length > 3 ? ` y ${invalid.length - 3} más` : "");
      throw new AppError(400, `El precio quedaría en cero o menos en: ${names}`);
    }
  }

  // Solo se tocan los que cambian de estado al archivar o restaurar.
  const targets =
    action.type === "archive"
      ? products.filter((p) => !p.archivedAt)
      : action.type === "restore"
        ? products.filter((p) => p.archivedAt)
        : products;
  if (action.type === "restore") await assertWithinLimit(prisma, actor, "products", targets.length);

  const data = (id: string): Prisma.ProductUpdateInput => {
    switch (action.type) {
      case "price":
        return { price: prices.get(id) };
      case "category":
        return { category: action.categoryId ? { connect: { id: action.categoryId } } : { disconnect: true } };
      case "minStock":
        return { minStock: qty(action.value) };
      case "archive":
        return { archivedAt: new Date() };
      case "restore":
        return { archivedAt: null };
    }
  };
  const field = action.type === "archive" || action.type === "restore" ? "archived" : action.type === "category" ? "categoryId" : action.type;

  await prisma.$transaction(
    async (tx) => {
      for (const p of targets) {
        await tx.product.update({ where: { id: p.id }, data: data(p.id) });
        await audit(tx, actor, BATCH_ACTION[action.type], "Product", p.id, {
          fields: [field],
          batch: true,
          ...(action.type === "price" && { from: Number(p.price), to: Number(prices.get(p.id)) }),
        });
      }
      await audit(tx, actor, "product.batch", "Product", null, { ...action, count: targets.length });
    },
    { timeout: 60_000 }
  );
  return { updated: targets.length, skipped: products.length - targets.length };
}

/** Importación desde un archivo CSV: misma lectura y validación que la carga masiva. */
export async function importProducts(actor: Actor, csv: string) {
  const { bulkImport } = await import("./bulk");
  const { BULK_SPECS, mapTable } = await import("@/lib/bulk");
  const table = mapTable(BULK_SPECS.products, parseCsv(csv));
  if (table.records.length === 0) throw new AppError(400, "El archivo no tiene productos");
  if (table.missing.length > 0) throw new AppError(400, `Faltan columnas: ${table.missing.join(", ")}`);
  return bulkImport(actor, "products", table.records.slice(0, 2000));
}

export interface ProductModifier {
  id: string;
  name: string;
  price: number;
}

/** Extras configurados en un producto (JSON validado al guardarse). */
export function productModifiers(product: { modifiers: unknown }): ProductModifier[] {
  return Array.isArray(product.modifiers) ? (product.modifiers as ProductModifier[]) : [];
}

/**
 * Asistente de variantes: crea copias del producto (mismo precio, costo, impuestos y categoría,
 * sin existencias ni código) con cada etiqueta, todas en el mismo grupo.
 */
export async function createVariants(actor: Actor, productId: string, input: { baseLabel: string; labels: string[] }) {
  const base = await prisma.product.findFirst({
    where: { id: productId, businessId: actor.businessId, archivedAt: null },
  });
  if (!base) throw new AppError(404, "Producto no encontrado");
  const group = base.variantGroup ?? base.name;
  const existing = await prisma.product.findMany({
    where: { businessId: actor.businessId, variantGroup: group, archivedAt: null },
    select: { variantLabel: true },
  });
  const taken = new Set(existing.map((p) => p.variantLabel?.toLowerCase()));
  const labels: string[] = [];
  for (const raw of input.labels) {
    const label = raw.trim();
    if (!label || taken.has(label.toLowerCase())) continue;
    taken.add(label.toLowerCase());
    labels.push(label);
  }
  if (labels.length === 0) throw new AppError(400, "Esas variantes ya existen");

  return prisma.$transaction(async (tx) => {
    await assertWithinLimit(tx, actor, "products", labels.length);
    if (!base.variantGroup) {
      await tx.product.update({
        where: { id: base.id },
        data: { variantGroup: group, variantLabel: base.variantLabel ?? input.baseLabel },
      });
    }
    const created = [];
    for (const label of labels) {
      created.push(
        await tx.product.create({
          data: {
            name: `${group} ${label}`,
            variantGroup: group,
            variantLabel: label,
            unit: base.unit,
            price: base.price,
            wholesalePrice: base.wholesalePrice,
            wholesaleMinQty: base.wholesaleMinQty,
            cost: base.cost,
            minStock: base.minStock,
            trackExpiry: base.trackExpiry,
            packSize: base.packSize,
            taxRate: base.taxRate,
            iepsRate: base.iepsRate,
            satProductKey: base.satProductKey,
            satUnitKey: base.satUnitKey,
            categoryId: base.categoryId,
            ...(base.modifiers ? { modifiers: base.modifiers } : {}),
            sendToKitchen: base.sendToKitchen,
            trackStock: base.trackStock,
            seniorEligible: base.seniorEligible,
            businessId: actor.businessId,
          },
        })
      );
    }
    await audit(tx, actor, "product.variants", "Product", base.id, { group, labels });
    return created;
  });
}
