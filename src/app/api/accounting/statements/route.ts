import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { accountingQuerySchema } from "@/lib/validation";
import { financialStatements } from "@/server/accounting";
import { accountingRange } from "../range";

/** Estado de resultados, balance general y flujo de efectivo del periodo. */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  const { fromKey, toKey } = accountingRange(auth, parseQuery(request, accountingQuerySchema));
  return financialStatements(auth.business, fromKey, toKey);
});
