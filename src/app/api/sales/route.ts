import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listQuerySchema, saleSchema } from "@/lib/validation";
import { createSale, listSales } from "@/server/sales";
import { publicSale } from "@/server/views";

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  const query = parseQuery(request, listQuerySchema);
  const result = await listSales(auth.businessId, auth.business.timezone, query);
  return { ...result, items: result.items.map((s) => publicSale(s, auth.role)) };
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, saleSchema);
  const sale = await createSale(auth, input);
  return created(publicSale(sale, auth.role));
});
