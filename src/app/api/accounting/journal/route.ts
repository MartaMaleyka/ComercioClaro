import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { csvResponse } from "@/lib/csv";
import { spreadsheetResponse } from "@/lib/spreadsheet";
import { accountingQuerySchema } from "@/lib/validation";
import { journal, ledger } from "@/server/accounting";
import { booksSpreadsheet, journalCsv } from "@/server/accounting-export";
import { accountingRange } from "../range";

/** Libro diario del periodo (JSON, CSV o Excel con el diario y el mayor). */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  const query = parseQuery(request, accountingQuerySchema);
  const { fromKey, toKey } = accountingRange(auth, query);
  const entries = await journal(auth.business, fromKey, toKey);
  const tz = auth.business.timezone;
  if (query.format === "csv") return csvResponse(`libro-diario-${fromKey}-${toKey}.csv`, journalCsv(entries, tz));
  if (query.format === "xls") {
    const accounts = await ledger(auth.business, fromKey, toKey);
    return spreadsheetResponse(`libros-${fromKey}-${toKey}.xls`, booksSpreadsheet(entries, accounts, tz));
  }
  return { from: fromKey, to: toKey, entries: entries.slice(-200), total: entries.length };
});
