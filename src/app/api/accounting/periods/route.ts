import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { listPeriods } from "@/server/accounting";

/** Los últimos 12 meses y cuáles están cerrados. */
export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  return listPeriods(auth.business);
});
