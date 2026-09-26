import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { listQuerySchema } from "@/lib/validation";

/** Kardex: historial de movimientos de inventario del producto. */
export const GET = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const query = parseQuery(request, listQuerySchema);
  const product = await prisma.product.findFirst({ where: { id, businessId: auth.businessId }, select: { id: true } });
  if (!product) throw notFound("Producto");

  const rows = await prisma.stockMovement.findMany({
    where: { productId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
