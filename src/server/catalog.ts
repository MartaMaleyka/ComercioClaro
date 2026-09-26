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

const HEADER_ALIASES: Record<string, keyof ProductInput> = {
  nombre: "name",
  name: "name",
  descripcion: "description",
  descripción: "description",
  sku: "sku",
  codigo: "barcode",
  código: "barcode",
  "codigo de barras": "barcode",
  "código de barras": "barcode",
  barcode: "barcode",
  unidad: "unit",
  unit: "unit",
  precio: "price",
  price: "price",
  "precio mayoreo": "wholesalePrice",
  "mayoreo desde": "wholesaleMinQty",
  costo: "cost",
  cost: "cost",
  existencia: "stock",
  stock: "stock",
  "stock minimo": "minStock",
  "stock mínimo": "minStock",
  minimo: "minStock",
  mínimo: "minStock",
  iva: "taxRate",
  ieps: "iepsRate",
  "clave sat": "satProductKey",
  "clave unidad sat": "satUnitKey",
  itbms: "taxRate",
  impuesto: "taxRate",
  "unidades por caja": "packSize",
  "por caja": "packSize",
};

const UNIT_ALIASES: Record<string, string> = {
  pieza: "PIECE",
  pza: "PIECE",
  pz: "PIECE",
  piece: "PIECE",
  kg: "KG",
  kilo: "KG",
  g: "G",
  gr: "G",
  l: "L",
  lt: "L",
  litro: "L",
  ml: "ML",
  m: "M",
  metro: "M",
  lb: "LB",
  lbs: "LB",
  libra: "LB",
  libras: "LB",
  oz: "OZ",
  onza: "OZ",
  gal: "GAL",
  galon: "GAL",
  galón: "GAL",
};

/**
 * Importa productos desde CSV. Si el código de barras (o el nombre) ya existe,
 * actualiza precio/costo/mínimo; la existencia solo se usa al crear productos nuevos.
 */
export async function importProducts(actor: Actor, csv: string) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new AppError(400, "El archivo no tiene productos");
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const categoryIndex = headers.findIndex((h) => h === "categoria" || h === "categoría" || h === "category");

  const results = { created: 0, updated: 0, errors: [] as { row: number; error: string }[] };
  const categories = new Map(
    (await prisma.category.findMany({ where: { businessId: actor.businessId } })).map((c) => [
      c.name.toLowerCase(),
      c.id,
    ])
  );

  for (let i = 1; i < rows.length && i <= 5000; i++) {
    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const key = HEADER_ALIASES[h];
      const value = rows[i][idx]?.trim();
      if (key && value !== undefined && value !== "") raw[key] = value;
    });
    if (typeof raw.unit === "string") raw.unit = UNIT_ALIASES[raw.unit.toLowerCase()] ?? raw.unit.toUpperCase();
    for (const k of ["taxRate", "iepsRate"] as const) {
      if (typeof raw[k] === "string" && /^exento$/i.test(String(raw[k]).trim())) raw[k] = "0";
      if (typeof raw[k] === "string") {
        const n = Number(String(raw[k]).replace("%", ""));
        raw[k] = n > 1 ? n / 100 : n;
      }
    }
    for (const k of ["price", "cost", "wholesalePrice"] as const) {
      if (typeof raw[k] === "string") raw[k] = String(raw[k]).replace(/[$,\s]/g, "");
    }

    const categoryName = categoryIndex >= 0 ? rows[i][categoryIndex]?.trim() : "";
    if (categoryName) {
      let categoryId = categories.get(categoryName.toLowerCase());
      if (!categoryId) {
        const category = await prisma.category.create({ data: { name: categoryName, businessId: actor.businessId } });
        categoryId = category.id;
        categories.set(categoryName.toLowerCase(), categoryId);
      }
      raw.categoryId = categoryId;
    }

    const parsed = productCreateSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      results.errors.push({ row: i + 1, error: `${issue.path.join(".")}: ${issue.message}` });
      continue;
    }
    const input = parsed.data;
    try {
      const existing = await prisma.product.findFirst({
        where: {
          businessId: actor.businessId,
          ...(input.barcode ? { barcode: input.barcode } : { name: { equals: input.name, mode: "insensitive" } }),
        },
      });
      if (existing) {
        const { stock: _stock, ...rest } = input;
        void _stock;
        const fields = Object.fromEntries(
          Object.entries(rest).filter(([k]) => k in raw || k === "categoryId")
        ) as Partial<ProductInput>;
        await updateProduct(actor, existing.id, { ...fields, archived: false });
        results.updated++;
      } else {
        await createProduct(actor, input);
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: i + 1, error: err instanceof AppError ? err.message : "No se pudo guardar" });
    }
  }
  return results;
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
