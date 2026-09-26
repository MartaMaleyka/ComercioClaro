import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { monthQuerySchema } from "@/lib/validation";
import { taxReport } from "@/server/insights";

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "advancedReports");
  const query = parseQuery(request, monthQuerySchema);
  const report = await taxReport(auth.business, query.month);
  if (query.format === "json") return report;

  const withIeps = report.lines.some((l) => l.iepsRate > 0);
  const headers = [
    `Tasa ${report.taxName}`,
    ...(withIeps ? ["Tasa IEPS"] : []),
    "Ventas (con impuestos)",
    "Devoluciones",
    "Total neto",
    "Base gravable",
    ...(withIeps ? ["IEPS"] : []),
    report.taxName,
  ];
  const rows = report.lines.map((l) => [
    pct(l.taxRate),
    ...(withIeps ? [pct(l.iepsRate)] : []),
    l.sales,
    l.returns,
    l.total,
    l.base,
    ...(withIeps ? [l.ieps] : []),
    l.tax,
  ]);
  rows.push([
    "Total",
    ...(withIeps ? [""] : []),
    report.totals.sales,
    report.totals.returns,
    report.totals.total,
    report.totals.base,
    ...(withIeps ? [report.totals.ieps] : []),
    report.totals.tax,
  ]);
  return csvResponse(`impuestos-${report.month}.csv`, toCsv(headers, rows));
});
