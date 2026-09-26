import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { kitchenQueue } from "@/server/open-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  return kitchenQueue(auth.businessId);
});
