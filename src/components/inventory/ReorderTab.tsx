"use client";

import Link from "next/link";
import useSWR from "swr";
import { ShoppingBag, ThumbsUp } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

interface Suggestion {
  productId: string;
  name: string;
  unit: string;
  category: string | null;
  stock: number;
  minStock: number;
  avgDailySales: number;
  daysOfCover: number | null;
  suggestedQuantity: number;
  lastSupplier: string | null;
  lastCost: number;
  low: boolean;
}

export function ReorderTab() {
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Suggestion[]>("/api/inventory/reorder", fetcher);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  if (data.length === 0) {
    return <EmptyState icon={ThumbsUp} title="Todo en orden" description="Ningún producto necesita resurtirse por ahora." />;
  }

  const total = data.reduce((acc, s) => acc + s.suggestedQuantity * s.lastCost, 0);
  const bySupplier = data.reduce<Record<string, Suggestion[]>>((acc, s) => {
    const key = s.lastSupplier ?? "Sin proveedor";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-600">
          Sugerencia para cubrir ~14 días según tus ventas de los últimos 30. Inversión estimada:{" "}
          <span className="font-semibold text-slate-900">{fmt.money(total)}</span>
        </p>
        <Link href="/compras?nueva=1" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white">
          <ShoppingBag className="w-4 h-4" /> Registrar compra
        </Link>
      </div>
      {Object.entries(bySupplier).map(([supplier, items]) => (
        <div key={supplier} className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-500">{supplier}</h3>
          {items.map((s) => (
            <Card key={s.productId}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    Hay {fmt.qty(s.stock, s.unit)} · vendes {fmt.number(s.avgDailySales, 2)}/día
                    {s.daysOfCover !== null && ` · alcanza ${fmt.number(s.daysOfCover, 1)} días`}
                  </p>
                  {s.low && <Badge tone="red" className="mt-1">Bajo el mínimo</Badge>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-brand-600">{fmt.qty(s.suggestedQuantity, s.unit)}</p>
                  <p className="text-xs text-slate-500">≈ {fmt.money(s.suggestedQuantity * s.lastCost)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
