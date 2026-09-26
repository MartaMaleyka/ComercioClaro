import { created, handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { openOrderSchema } from "@/lib/validation";
import { listOpenOrders, saveOpenOrder } from "@/server/open-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return listOpenOrders(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  return created(await saveOpenOrder(auth, await parseBody(request, openOrderSchema)));
});
