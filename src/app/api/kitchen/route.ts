import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { kitchenQueue } from "@/server/open-orders";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return kitchenQueue(auth.businessId);
});
