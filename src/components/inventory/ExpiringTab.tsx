"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarCheck } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

interface Batch {
  id: string;
  lotCode: string | null;
  expiresAt: string;
  remaining: number;
  product: { id: string; name: string; unit: string };
}

export function ExpiringTab() {
  const fmt = useFormat();
  const [days, setDays] = useState("30");
  const { data, error, mutate } = useSWR<Batch[]>(`/api/inventory/expiring?days=${days}`, fetcher);
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-4">
      <Select aria-label="Periodo" value={days} onChange={(e) => setDays(e.target.value)} className="w-auto">
        <option value="7">Próximos 7 días</option>
        <option value="30">Próximos 30 días</option>
        <option value="90">Próximos 90 días</option>
      </Select>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nada por caducar"
          description="Activa “Controlar lotes y caducidad” en los productos y captura la fecha al registrar compras."
        />
      ) : (
        <div className="space-y-2">
          {data.map((b) => {
            const daysLeft = Math.ceil((new Date(b.expiresAt).getTime() - now) / 86400000);
            return (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{b.product.name}</p>
                    <p className="text-xs text-slate-500">
                      {fmt.qty(b.remaining, b.product.unit)}
                      {b.lotCode && ` · lote ${b.lotCode}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{fmt.date(b.expiresAt)}</p>
                    {daysLeft < 0 ? (
                      <Badge tone="red">Caducado</Badge>
                    ) : (
                      <Badge tone={daysLeft <= 7 ? "red" : "amber"}>{daysLeft === 0 ? "Hoy" : `${daysLeft} días`}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-xs text-slate-500">
            Para dar de baja producto caducado usa &quot;Ajustar existencia&quot; con motivo Caducidad.
          </p>
        </div>
      )}
    </div>
  );
}
