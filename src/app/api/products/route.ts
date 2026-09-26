import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productCreateSchema } from "@/lib/validation";
import { createProduct } from "@/server/catalog";
import { publicProduct } from "@/server/views";

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(64).optional(),
  categoryId: z.string().max(64).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  all: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  const q = parseQuery(request, querySchema);

  const where: Prisma.ProductWhereInput = {
    businessId: auth.businessId,
    archivedAt: q.archived === "true" ? { not: null } : null,
  };
  if (q.barcode) where.barcode = q.barcode;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.lowStock === "true") {
    where.stock = { lte: prisma.product.fields.minStock };
    where.trackStock = true;
  }
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { barcode: { startsWith: q.search } },
      { sku: { startsWith: q.search, mode: "insensitive" } },
    ];
  }

  const include = { category: { select: { id: true, name: true } } };
  const view = (p: Parameters<typeof publicProduct>[0]) => publicProduct(p, auth.role);

  // Catálogo completo para el punto de venta (y su copia sin conexión).
  if (q.all === "true") {
    const items = await prisma.product.findMany({ where, include, orderBy: { name: "asc" }, take: 10000 });
    return { items: items.map(view), nextCursor: null };
  }

  const rows = await prisma.product.findMany({
    where,
    include,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items: items.map(view), nextCursor: hasMore ? items[items.length - 1].id : null };
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, productCreateSchema);
  return created(await createProduct(auth, input));
});
