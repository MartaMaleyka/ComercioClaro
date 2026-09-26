import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { reportQuerySchema } from "@/lib/validation";
import { businessReport, consolidatedReport } from "@/server/reports";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, reportQuerySchema);
  if (query.scope === "all") return consolidatedReport(auth.userId, query);
  return businessReport(auth.business, query);
});
