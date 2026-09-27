import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { periodSchema } from "@/lib/validation";
import { closePeriod } from "@/server/accounting";

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  const { month } = await parseBody(request, periodSchema);
  return closePeriod({ ...auth, timezone: auth.business.timezone }, month);
});
