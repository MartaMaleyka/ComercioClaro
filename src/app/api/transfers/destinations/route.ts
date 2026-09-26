import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { transferDestinations } from "@/server/transfers";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return transferDestinations(auth.userId, auth.businessId);
});
