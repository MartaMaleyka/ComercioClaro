import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { transferDestinations } from "@/server/transfers";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "branches");
  return transferDestinations(auth.userId, auth.businessId);
});
