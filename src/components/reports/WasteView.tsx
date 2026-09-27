"use client";

import useSWR from "swr";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import type { Unit } from "@/lib/client/types";
import { ADJUSTMENT_REASON_LABELS } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, ListSkeleton, Stat } from "@/components/ui/Misc";

interface Waste {
  total: number;
  products: { productId: string; name: string; unit: Unit; isIngredient: boolean; quantity: number; value: number }[];
  byReason: { reason: string; value: number }[];
}

/** Merma del periodo (desperdicio, caducidad y daño) valorada a costo. */
export function WasteView({ query }: { query: Record<string, string> }) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Waste>(withQuery("/api/reports/waste", query), fetcher);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label={tr("Merma total (a costo)")}
          value={fmt.money(data.total)}
          tone={data.total > 0 ? "negative" : "default"}
        />
        {data.byReason.map((r) => (
          <Stat key={r.reason} label={tr(ADJUSTMENT_REASON_LABELS[r.reason] ?? r.reason)} value={fmt.money(r.value)} />
        ))}
      </div>
      {data.products.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr("Sin merma en el periodo. Se registra con Ajustar existencia y el motivo Merma, Caducidad o Dañado.")}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Merma por producto")}</h2>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <caption className="sr-only">{tr("Merma por producto")}</caption>
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th scope="col" className="py-1 font-medium">
                    {tr("Producto")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Cantidad")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Valor a costo")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.products.map((p) => (
                  <tr key={p.productId}>
                    <th scope="row" className="py-2 text-left font-normal text-slate-900">
                      {p.name} {p.isIngredient && <Badge tone="purple">{tr("Insumo")}</Badge>}
                    </th>
                    <td className="py-2 text-right tabular-nums">{fmt.qty(p.quantity, p.unit)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt.money(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
