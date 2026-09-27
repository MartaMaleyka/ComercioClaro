import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { reopenPeriodSchema } from "@/lib/validation";
import { reopenPeriod } from "@/server/accounting";

/** Reabre un mes cerrado; el motivo queda en la bitácora. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  const { month, reason } = await parseBody(request, reopenPeriodSchema);
  return reopenPeriod(auth, month, reason);
});
