import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { reportQuerySchema } from "@/lib/validation";
import { resolveReportRange } from "@/server/reports";
import { wasteReport } from "@/server/recipes";

/** Merma del periodo (desperdicio, caducidad y daño) valorada a costo. */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const range = resolveReportRange(auth.business.timezone, parseQuery(request, reportQuerySchema));
  return { from: range.fromKey, to: range.toKey, ...(await wasteReport(auth.businessId, range)) };
});
