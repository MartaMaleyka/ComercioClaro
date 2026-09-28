import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { money } from "@/lib/decimal";
import { BULK_MAX_ROWS, BULK_SPECS, checkRow, type BulkEntity } from "@/lib/bulk";
import type {
  customerSchema,
  employeeSchema,
  expenseSchema,
  productCreateSchema,
  supplierSchema,
} from "@/lib/validation";
import { createProduct, updateProduct, type ProductInput } from "./catalog";
import { consentFields } from "./customers";
import { createEmployee, updateEmployee } from "./payroll";
import { assertOpenPeriod } from "./accounting";
import type { Actor } from "./inventory";

export interface BulkResult {
  created: number;
  updated: number;
  /** Filas que ya existían y se dejaron igual (categorías repetidas) */
  skipped: number;
  /** Número de fila como se ve en la hoja (la 1 es el encabezado) */
  errors: { row: number; error: string }[];
}

/**
 * Guarda una carga masiva fila por fila: una fila con error no detiene a las demás y se informa
 * con su número. Los registros que ya existen (según la clave de cada tipo) se actualizan.
 */
export async function bulkImport(
  actor: Actor,
  entity: BulkEntity,
  records: Record<string, string>[],
  /** Número de fila en la hoja de cada registro (si el navegador mandó solo las filas válidas) */
  lines?: number[]
) {
  if (records.length === 0) throw new AppError(400, "No hay filas para importar");
  if (records.length > BULK_MAX_ROWS) {
    throw new AppError(400, `Máximo ${BULK_MAX_ROWS} filas por carga; divide el archivo en partes`);
  }
  const result: BulkResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const save = SAVERS[entity];
  const context = await loadContext(actor, entity);

  for (let i = 0; i < records.length; i++) {
    const row = lines?.[i] ?? i + 2;
    const check = checkRow(entity, records[i]);
    if (!check.ok) {
      result.errors.push({ row, error: check.error });
      continue;
    }
    try {
      const outcome = await save(actor, check.data, records[i], context);
      result[outcome]++;
    } catch (err) {
      result.errors.push({ row, error: err instanceof AppError ? err.message : "No se pudo guardar" });
    }
  }

  await prisma.$transaction((tx) =>
    audit(tx, actor, "bulk.import", BULK_SPECS[entity].noun, null, {
      entity,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.length,
    })
  );
  return result;
}

type Outcome = "created" | "updated" | "skipped";

/** Al actualizar, solo cambian las columnas que trae el archivo (lo demás se queda como estaba). */
function onlyPresent<T extends object>(input: T, record: Record<string, string>) {
  return Object.fromEntries(Object.entries(input).filter(([k]) => k in record)) as Partial<T>;
}

const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface Context {
  /** Categorías del negocio por nombre en minúsculas */
  categories: Map<string, string>;
}

async function loadContext(actor: Actor, entity: BulkEntity): Promise<Context> {
  const categories = new Map<string, string>();
  if (entity === "products" || entity === "categories") {
    for (const c of await prisma.category.findMany({ where: { businessId: actor.businessId } })) {
      categories.set(c.name.toLowerCase(), c.id);
    }
  }
  return { categories };
}

async function categoryId(actor: Actor, context: Context, name: string) {
  const key = name.trim().toLowerCase();
  const existing = context.categories.get(key);
  if (existing) return existing;
  const category = await prisma.category.create({ data: { name: name.trim(), businessId: actor.businessId } });
  context.categories.set(key, category.id);
  return category.id;
}

const SAVERS: Record<
  BulkEntity,
  (actor: Actor, data: unknown, record: Record<string, string>, context: Context) => Promise<Outcome>
> = {
  async products(actor, data, record, context) {
    const input = data as z.infer<typeof productCreateSchema>;
    if (record.category) input.categoryId = await categoryId(actor, context, record.category);
    const existing = await prisma.product.findFirst({
      where: {
        businessId: actor.businessId,
        ...(input.barcode ? { barcode: input.barcode } : { name: { equals: input.name, mode: "insensitive" } }),
      },
    });
    if (!existing) {
      await createProduct(actor, input as ProductInput);
      return "created";
    }
    // Solo se cambian las columnas que trae el archivo; la existencia se ajusta con un conteo, no aquí.
    const present = new Set(Object.keys(record));
    if (record.category) present.add("categoryId");
    const fields = Object.fromEntries(
      Object.entries(input).filter(([k]) => k !== "stock" && present.has(k))
    ) as Partial<ProductInput>;
    await updateProduct(actor, existing.id, { ...fields, archived: false });
    return "updated";
  },

  async categories(actor, data, _record, context) {
    const { name } = data as { name: string };
    if (context.categories.has(name.trim().toLowerCase())) return "skipped";
    await categoryId(actor, context, name);
    return "created";
  },

  async customers(actor, data, record) {
    const input = data as z.infer<typeof customerSchema>;
    const existing = await prisma.customer.findFirst({
      where: {
        businessId: actor.businessId,
        ...(input.phone ? { phone: input.phone } : { name: { equals: input.name, mode: "insensitive" } }),
      },
    });
    return prisma.$transaction(async (tx) => {
      if (existing) {
        const changes = onlyPresent(input, record);
        await tx.customer.update({
          where: { id: existing.id },
          data: {
            ...changes,
            ...("marketingConsent" in record ? consentFields(input.marketingConsent, existing) : {}),
          },
        });
        await audit(tx, actor, "customer.update", "Customer", existing.id, { name: input.name, bulk: true });
        return "updated" as const;
      }
      const customer = await tx.customer.create({
        data: { ...input, ...consentFields(input.marketingConsent), businessId: actor.businessId },
      });
      await audit(tx, actor, "customer.create", "Customer", customer.id, { name: customer.name, bulk: true });
      return "created" as const;
    });
  },

  async suppliers(actor, data, record) {
    const input = data as z.infer<typeof supplierSchema>;
    const existing = await prisma.supplier.findFirst({
      where: { businessId: actor.businessId, name: { equals: input.name, mode: "insensitive" } },
    });
    return prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.supplier.update({ where: { id: existing.id }, data: onlyPresent(input, record) });
        await audit(tx, actor, "supplier.update", "Supplier", existing.id, { name: input.name, bulk: true });
        return "updated" as const;
      }
      const supplier = await tx.supplier.create({ data: { ...input, businessId: actor.businessId } });
      await audit(tx, actor, "supplier.create", "Supplier", supplier.id, { name: supplier.name, bulk: true });
      return "created" as const;
    });
  },

  async expenses(actor, data) {
    const input = data as z.infer<typeof expenseSchema>;
    const date = input.date ?? new Date();
    if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new AppError(400, "La fecha no puede ser futura");
    return prisma.$transaction(async (tx) => {
      await assertOpenPeriod(tx, actor.businessId, date);
      // Los gastos cargados en lote son históricos: no salen de la caja abierta.
      const expense = await tx.expense.create({
        data: {
          category: input.category,
          description: input.description,
          amount: money(input.amount),
          paymentMethod: input.paymentMethod,
          date,
          cashSessionId: null,
          userId: actor.userId,
          businessId: actor.businessId,
        },
      });
      await audit(tx, actor, "expense.create", "Expense", expense.id, {
        amount: input.amount,
        category: input.category,
        bulk: true,
      });
      return "created" as const;
    });
  },

  async employees(actor, data, record) {
    const input = data as z.infer<typeof employeeSchema>;
    const existing = await prisma.employee.findFirst({
      where: {
        businessId: actor.businessId,
        ...(input.idNumber ? { idNumber: input.idNumber } : { name: { equals: input.name, mode: "insensitive" } }),
      },
    });
    if (existing) {
      const current = {
        name: existing.name,
        idNumber: existing.idNumber,
        socialSecurityNumber: existing.socialSecurityNumber,
        position: existing.position,
        salary: Number(existing.salary),
        frequency: existing.frequency,
        hireDate: dayKey(existing.hireDate)!,
        vacationSince: dayKey(existing.vacationSince),
        active: existing.active,
      };
      await updateEmployee(actor, existing.id, { ...current, ...onlyPresent(input, record) });
      return "updated";
    }
    await createEmployee(actor, input);
    return "created";
  },
};
