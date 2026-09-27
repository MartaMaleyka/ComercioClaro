"use client";

import useSWR from "swr";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface CashierRow {
  userId: string;
  name: string;
  role: "OWNER" | "CASHIER" | null;
  salesCount: number;
  salesTotal: number;
  averageTicket: number;
  discounts: number;
  cancellations: number;
  returnsCount: number;
  returnsTotal: number;
  closings: number;
  cashDifference: number;
  shortages: number;
}

/** Desempeño por persona: ventas, descuentos, cancelaciones y faltantes de caja. */
export function TeamView({ query }: { query: Record<string, string> }) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<{ cashiers: CashierRow[] }>(
    withQuery("/api/reports/cashiers", query),
    fetcher
  );

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={3} />;
  if (data.cashiers.length === 0) return <p className="text-sm text-slate-500">{tr("Sin ventas en el periodo.")}</p>;

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Desempeño por persona")}</h2>
        <p className="text-xs text-slate-500">
          {tr(
            "Descuentos manuales sin contar promociones. Faltantes: suma de los cortes que cerraron con menos efectivo."
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={tr("Desempeño por persona")}>
          <table className="w-full text-sm min-w-[720px]">
            <caption className="sr-only">{tr("Desempeño por persona")}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-1 font-medium">
                  {tr("Persona")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Ventas")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Total vendido")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Ticket promedio")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Descuentos")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Cancelaciones")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Devoluciones")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Cortes")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Faltantes")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.cashiers.map((c) => (
                <tr key={c.userId}>
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="text-slate-900">{c.name}</span>{" "}
                    {c.role && <Badge tone="gray">{tr(c.role === "OWNER" ? "Dueño" : "Cajero")}</Badge>}
                  </th>
                  <td className="py-2 text-right tabular-nums">{c.salesCount}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(c.salesTotal)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(c.averageTicket)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(c.discounts)}</td>
                  <td className="py-2 text-right tabular-nums">{c.cancellations}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.returnsCount > 0 ? `${c.returnsCount} · ${fmt.money(c.returnsTotal)}` : "0"}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.closings}</td>
                  <td className={cn("py-2 text-right tabular-nums", c.shortages > 0 && "text-red-600 font-medium")}>
                    {fmt.money(c.shortages)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
