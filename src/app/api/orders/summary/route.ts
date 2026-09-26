import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { onlineOrderCounts } from "@/server/online-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  requireFeature(auth, "catalog");
  return onlineOrderCounts(auth.businessId);
});
