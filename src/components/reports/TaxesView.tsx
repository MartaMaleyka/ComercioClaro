"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download } from "lucide-react";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { useSession } from "@/components/providers/SessionProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, ListSkeleton, Stat } from "@/components/ui/Misc";

interface TaxReport {
  month: string;
  taxName: string;
  salesCount: number;
  lines: {
    taxRate: number;
    iepsRate: number;
    sales: number;
    returns: number;
    total: number;
    base: number;
    ieps: number;
    tax: number;
  }[];
  totals: { sales: number; returns: number; total: number; base: number; ieps: number; tax: number };
  purchases?: { count: number; credit: number };
  netTax?: number;
}

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

/** Impuestos del mes por tasa, listos para la declaración (ITBMS / IVA). */
export function TaxesView() {
  const tr = useText();
  const fmt = useFormat();
  const { business } = useSession();
  const [month, setMonth] = useState(todayKey(business.timezone).slice(0, 7));
  const { data, error, mutate } = useSWR<TaxReport>(withQuery("/api/reports/taxes", { month }), fetcher);
  const withIeps = data?.lines.some((l) => l.iepsRate > 0) ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <Input
          type="month"
          label={tr("Mes")}
          value={month}
          max={todayKey(business.timezone).slice(0, 7)}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        <a
          href={withQuery("/api/reports/taxes", { month, format: "csv" })}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> {tr("Descargar CSV")}
        </a>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={tr("Ventas netas del mes")}
              value={fmt.money(data.totals.total)}
              hint={tr("{n} ventas", { n: data.salesCount })}
            />
            <Stat label={tr("Base gravable")} value={fmt.money(data.totals.base)} />
            <Stat
              label={tr("{tax} a declarar", { tax: data.taxName })}
              value={fmt.money(data.totals.tax)}
              tone="warning"
            />
            <Stat label={tr("Devoluciones del mes")} value={fmt.money(data.totals.returns)} />
          </div>
          {data.purchases && data.netTax !== undefined && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat
                label={tr("Crédito fiscal (compras)")}
                value={fmt.money(data.purchases.credit)}
                hint={tr("{tax} de {n} compras del mes", { tax: data.taxName, n: data.purchases.count })}
              />
              <Stat
                label={tr("{tax} a pagar (neto)", { tax: data.taxName })}
                value={fmt.money(Math.max(0, data.netTax))}
                hint={
                  data.netTax < 0
                    ? tr("Saldo a favor: {amount}", { amount: fmt.money(-data.netTax) })
                    : tr("A declarar menos el crédito fiscal")
                }
                tone="warning"
              />
            </div>
          )}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{tr("Desglose por tasa")}</h2>
              <p className="text-xs text-slate-500">
                {tr(
                  "Los precios incluyen impuestos. Los descuentos y puntos se prorratean y las devoluciones restan en el mes en que se hacen."
                )}
              </p>
            </CardHeader>
            <CardContent>
              {data.lines.length === 0 ? (
                <p className="text-sm text-slate-500">{tr("Sin ventas en el periodo.")}</p>
              ) : (
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={tr("Desglose por tasa")}>
                  <table className="w-full text-sm min-w-[520px]">
                    <caption className="sr-only">{tr("Impuestos por tasa")}</caption>
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th scope="col" className="py-1 font-medium">
                          {tr("Tasa")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Ventas")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Devoluciones")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Base gravable")}
                        </th>
                        {withIeps && (
                          <th scope="col" className="py-1 font-medium text-right">
                            IEPS
                          </th>
                        )}
                        <th scope="col" className="py-1 font-medium text-right">
                          {data.taxName}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.lines.map((l) => (
                        <tr key={`${l.taxRate}-${l.iepsRate}`}>
                          <th scope="row" className="py-2 text-left font-normal text-slate-900">
                            {l.taxRate === 0 ? tr("Exento") : pct(l.taxRate)}
                            {l.iepsRate > 0 && (
                              <span className="text-xs text-slate-500"> · IEPS {pct(l.iepsRate)}</span>
                            )}
                          </th>
                          <td className="py-2 text-right tabular-nums">{fmt.money(l.sales)}</td>
                          <td className="py-2 text-right tabular-nums">{fmt.money(l.returns)}</td>
                          <td className="py-2 text-right tabular-nums">{fmt.money(l.base)}</td>
                          {withIeps && <td className="py-2 text-right tabular-nums">{fmt.money(l.ieps)}</td>}
                          <td className="py-2 text-right tabular-nums font-medium">{fmt.money(l.tax)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <th scope="row" className="py-2 text-left">
                          {tr("Total")}
                        </th>
                        <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.sales)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.returns)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.base)}</td>
                        {withIeps && <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.ieps)}</td>}
                        <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.tax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-3">
                {tr("El crédito fiscal de tus compras se calcula aparte: las compras no guardan su impuesto.")}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
