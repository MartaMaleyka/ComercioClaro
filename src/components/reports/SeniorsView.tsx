"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Download } from "lucide-react";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { useSession } from "@/components/providers/SessionProvider";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, ListSkeleton, Stat } from "@/components/ui/Misc";

interface SeniorReport {
  month: string;
  count: number;
  discount: number;
  total: number;
  sales: {
    id: string;
    folio: number;
    createdAt: string;
    seniorId: string | null;
    customer: string | null;
    cashier: string;
    total: number;
    discount: number;
  }[];
}

/** Descuentos de jubilado del mes (Ley 6 de 1987), con la cédula o carné de cada venta. */
export function SeniorsView() {
  const tr = useText();
  const fmt = useFormat();
  const { business } = useSession();
  const [month, setMonth] = useState(todayKey(business.timezone).slice(0, 7));
  const { data, error, mutate } = useSWR<SeniorReport>(withQuery("/api/reports/seniors", { month }), fetcher);

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
          href={withQuery("/api/reports/seniors", { month, format: "csv" })}
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Stat label={tr("Ventas a jubilados")} value={fmt.number(data.count)} />
            <Stat label={tr("Descuento otorgado")} value={fmt.money(data.discount)} tone="warning" />
            <Stat label={tr("Total cobrado")} value={fmt.money(data.total)} />
          </div>
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{tr("Detalle por venta")}</h2>
              <p className="text-xs text-slate-500">
                {tr("Guarda este reporte: Acodeco puede pedir la prueba de los descuentos otorgados.")}
              </p>
            </CardHeader>
            <CardContent>
              {data.sales.length === 0 ? (
                <p className="text-sm text-slate-500">{tr("Sin ventas en el periodo.")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <caption className="sr-only">{tr("Descuentos de jubilado")}</caption>
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th scope="col" className="py-1 font-medium">
                          {tr("Venta")}
                        </th>
                        <th scope="col" className="py-1 font-medium">
                          {tr("Cédula o carné")}
                        </th>
                        <th scope="col" className="py-1 font-medium">
                          {tr("Cajero")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Total cobrado")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Descuento")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.sales.map((s) => (
                        <tr key={s.id}>
                          <th scope="row" className="py-2 text-left font-normal">
                            <Link
                              href={`/ventas/${s.id}`}
                              className="text-brand-700 dark:text-brand-300 hover:underline"
                            >
                              #{s.folio}
                            </Link>
                            <span className="block text-xs text-slate-500">{fmt.dateTime(s.createdAt)}</span>
                          </th>
                          <td className="py-2">
                            {s.seniorId ?? <span className="text-slate-500">{tr("Sin número")}</span>}
                            {s.customer && <span className="block text-xs text-slate-500">{s.customer}</span>}
                          </td>
                          <td className="py-2">{s.cashier}</td>
                          <td className="py-2 text-right tabular-nums">{fmt.money(s.total)}</td>
                          <td className="py-2 text-right tabular-nums font-medium">{fmt.money(s.discount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
