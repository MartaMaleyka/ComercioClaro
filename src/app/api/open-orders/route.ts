import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { openOrderSchema } from "@/lib/validation";
import { listOpenOrders, saveOpenOrder } from "@/server/open-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  return listOpenOrders(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  return created(await saveOpenOrder(auth, await parseBody(request, openOrderSchema)));
});
