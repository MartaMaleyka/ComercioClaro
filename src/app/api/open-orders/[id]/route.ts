import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { openOrderSchema } from "@/lib/validation";
import { getOpenOrder, saveOpenOrder } from "@/server/open-orders";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  return getOpenOrder(auth.businessId, (await params).id);
});

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  return saveOpenOrder(auth, await parseBody(request, openOrderSchema), (await params).id);
});
