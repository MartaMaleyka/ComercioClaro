import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invoiceSaleSchema, listQuerySchema } from "@/lib/validation";
import { invoiceSale } from "@/server/invoices";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, listQuerySchema);
  const rows = await prisma.invoice.findMany({
    where: { businessId: auth.businessId },
    include: { customer: { select: { name: true, rfc: true } }, _count: { select: { sales: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    configured: Boolean(process.env.FACTURAMA_USER && process.env.FACTURAMA_PASSWORD),
  };
});

/** Factura individual de una venta. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, invoiceSaleSchema);
  return created(await invoiceSale(auth, input));
});
