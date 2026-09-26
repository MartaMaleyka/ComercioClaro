import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listQuerySchema, purchaseSchema } from "@/lib/validation";
import { createPurchase, listPurchases } from "@/server/purchases";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, listQuerySchema);
  return listPurchases(auth.businessId, auth.business.timezone, query);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, purchaseSchema);
  return created(await createPurchase(auth, input));
});
