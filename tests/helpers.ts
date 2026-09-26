import { prisma } from "@/lib/prisma";
import type { SalesActor } from "@/server/sales";
import { createProduct, type ProductInput } from "@/server/catalog";

export const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

/** Vacía todas las tablas de la aplicación. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;

export async function createOwner(): Promise<SalesActor> {
  counter++;
  const user = await prisma.user.create({
    data: {
      email: `owner${counter}-${Date.now()}@test.com`,
      passwordHash: "x",
      name: "Dueño",
      memberships: { create: { role: "OWNER", business: { create: { name: `Negocio ${counter}` } } } },
    },
    include: { memberships: true },
  });
  return { userId: user.id, businessId: user.memberships[0].businessId, role: "OWNER" };
}

export function product(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: `Producto ${++counter}`,
    description: null,
    sku: null,
    barcode: null,
    unit: "PIECE",
    price: 10,
    wholesalePrice: null,
    wholesaleMinQty: null,
    cost: 6,
    stock: 10,
    minStock: 2,
    trackExpiry: false,
    taxRate: 0.16,
    iepsRate: 0,
    satProductKey: "01010101",
    satUnitKey: "H87",
    categoryId: null,
    ...overrides,
  };
}

export async function makeProduct(actor: SalesActor, overrides: Partial<ProductInput> = {}) {
  return createProduct(actor, product(overrides));
}

export function saleInput(items: { productId: string; quantity: number; discount?: number; unitPrice?: number }[], extra: Record<string, unknown> = {}) {
  return {
    items: items.map((i) => ({ discount: 0, ...i })),
    discount: 0,
    paymentMethod: "CASH" as const,
    notes: null,
    ...extra,
  };
}
