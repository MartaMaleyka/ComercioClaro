import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { onlineOrderCounts } from "@/server/online-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return onlineOrderCounts(auth.businessId);
});
