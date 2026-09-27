import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { accountingQuerySchema } from "@/lib/validation";
import { ledger } from "@/server/accounting";
import { ledgerCsv } from "@/server/accounting-export";
import { accountingRange } from "../range";

/** Libro mayor del periodo por cuenta (JSON o CSV). */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  const query = parseQuery(request, accountingQuerySchema);
  const { fromKey, toKey } = accountingRange(auth, query);
  const accounts = await ledger(auth.business, fromKey, toKey);
  if (query.format === "csv") {
    return csvResponse(`libro-mayor-${fromKey}-${toKey}.csv`, ledgerCsv(accounts, auth.business.timezone));
  }
  return { from: fromKey, to: toKey, accounts };
});
