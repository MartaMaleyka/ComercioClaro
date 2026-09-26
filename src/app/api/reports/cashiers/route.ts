import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { reportQuerySchema } from "@/lib/validation";
import { cashierReport } from "@/server/insights";
import { resolveReportRange } from "@/server/reports";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, reportQuerySchema);
  const range = resolveReportRange(auth.business.timezone, query);
  return { from: range.fromKey, to: range.toKey, cashiers: await cashierReport(auth.businessId, range) };
});
