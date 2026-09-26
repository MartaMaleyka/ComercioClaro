import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/dates";
import { monthQuerySchema } from "@/lib/validation";
import { seniorReport } from "@/server/insights";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, monthQuerySchema);
  const report = await seniorReport(auth.business, query.month);
  if (query.format === "json") return report;

  const rows = report.sales.map((s) => [
    dayKey(s.createdAt, auth.business.timezone),
    s.folio,
    s.seniorId ?? "",
    s.customer ?? "",
    s.cashier,
    s.total,
    s.discount,
  ]);
  rows.push(["Total", "", "", "", "", report.total, report.discount]);
  return csvResponse(
    `jubilados-${report.month}.csv`,
    toCsv(["Fecha", "Venta", "Cédula o carné", "Cliente", "Cajero", "Total cobrado", "Descuento de jubilado"], rows)
  );
});
