import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { onlineOrderStatusSchema } from "@/lib/validation";
import { getOnlineOrder, setOnlineOrderStatus } from "@/server/online-orders";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "catalog");
  return getOnlineOrder(auth.businessId, (await params).id);
});

export const PATCH = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "catalog");
  const { status } = await parseBody(request, onlineOrderStatusSchema);
  return setOnlineOrderStatus(auth, (await params).id, status);
});
