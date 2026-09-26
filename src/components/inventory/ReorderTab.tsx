"use client";

import { useText } from "@/lib/client/i18n";
import Link from "next/link";
import useSWR from "swr";
import { MessageCircle, ShoppingBag, ThumbsUp } from "lucide-react";
import { whatsappLink } from "@/lib/client/receipt";
import { UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
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
  supplierPhone: string | null;
  supplierContact: string | null;
  packSize: number | null;
  lastCost: number;
  low: boolean;
}

/** Cantidad sugerida redondeada a cajas completas cuando el producto se compra por caja. */
function orderLine(s: Suggestion, unitLabel: string) {
  if (s.packSize && s.packSize > 1) {
    const boxes = Math.ceil(s.suggestedQuantity / s.packSize);
    return `${boxes} caja(s) de ${s.packSize} · ${s.name}`;
  }
  return `${s.suggestedQuantity} ${unitLabel} · ${s.name}`;
}

export function ReorderTab() {
  const tr = useText();
  const fmt = useFormat();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<Suggestion[]>("/api/inventory/reorder", fetcher);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={ThumbsUp}
        title={tr("Todo en orden")}
        description={tr("Ningún producto necesita resurtirse por ahora.")}
      />
    );
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
          {tr("Sugerencia para cubrir ~14 días según tus ventas de los últimos 30. Inversión estimada:")}{" "}
          <span className="font-semibold text-slate-900">{fmt.money(total)}</span>
        </p>
        <Link
          href="/compras?nueva=1"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white"
        >
          <ShoppingBag className="w-4 h-4" /> {tr("Registrar compra")}
        </Link>
      </div>
      {Object.entries(bySupplier).map(([supplier, items]) => (
        <div key={supplier} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-500">{supplier}</h3>
            <a
              href={whatsappLink(
                [
                  `Hola${items[0].supplierContact ? ` ${items[0].supplierContact}` : ""}, le escribe ${business.name}. Quisiera hacer el siguiente pedido:`,
                  "",
                  ...items.map((s) => `• ${orderLine(s, UNIT_LABELS[s.unit] ?? s.unit)}`),
                  "",
                  "¿Me confirma disponibilidad y precio? Gracias.",
                ].join("\n"),
                items[0].supplierPhone,
                business.locale
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-300 hover:underline"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> {tr("Pedir por WhatsApp")}
            </a>
          </div>
          {items.map((s) => (
            <Card key={s.productId}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {tr("Hay {stock} · vendes {avg}/día", {
                      stock: fmt.qty(s.stock, s.unit),
                      avg: fmt.number(s.avgDailySales, 2),
                    })}
                    {s.daysOfCover !== null && tr(" · alcanza {n} días", { n: fmt.number(s.daysOfCover, 1) })}
                  </p>
                  {s.low && (
                    <Badge tone="red" className="mt-1">
                      {tr("Bajo el mínimo")}
                    </Badge>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-brand-600">{fmt.qty(s.suggestedQuantity, s.unit)}</p>
                  {s.packSize && s.packSize > 1 && (
                    <p className="text-xs text-slate-500">
                      ≈ {Math.ceil(s.suggestedQuantity / s.packSize)} {tr("caja(s)")}
                    </p>
                  )}
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
