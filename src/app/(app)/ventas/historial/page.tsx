"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { usePaginated, useDebounce } from "@/lib/client/hooks";
import { useFormat, todayKey } from "@/lib/client/format";
import { withQuery } from "@/lib/client/api";
import type { Sale } from "@/lib/client/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { countryConfig } from "@/lib/country";
import { useSession } from "@/components/providers/SessionProvider";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

export default function SalesHistoryPage() {
  const tr = useText();
  const { business, role } = useSession();
  const fmt = useFormat();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(todayKey(business.timezone, -30));
  const [to, setTo] = useState(todayKey(business.timezone));
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const debounced = useDebounce(search);
  const params = { search: debounced, from, to, status, paymentMethod };
  const { items, error, isLoading, hasMore, loadMore, loadingMore, mutate } = usePaginated<Sale>("/api/sales", params);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Ventas")}
        description={tr("Historial, devoluciones y tickets")}
        actions={
          role === "OWNER" &&
          business.features.includes("export") && (
            <a
              href={withQuery("/api/export/sales", { from, to })}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> {tr("CSV")}
            </a>
          )
        }
      />

      <div className="grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
        <SearchBar value={search} onChange={setSearch} placeholder={tr("Buscar por producto, cliente o folio")} />
        <Input type="date" aria-label={tr("Desde")} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label={tr("Hasta")} value={to} onChange={(e) => setTo(e.target.value)} />
        <Select aria-label={tr("Estado")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{tr("Todas")}</option>
          <option value="ACTIVE">{tr("Activas")}</option>
          <option value="CANCELLED">{tr("Canceladas")}</option>
        </Select>
        <Select
          aria-label={tr("Forma de pago")}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          <option value="">{tr("Toda forma de pago")}</option>
          {countryConfig(business.country).paymentMethods.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} title={tr("Sin ventas")} description={tr("No hay ventas en este periodo.")} />
      ) : (
        <div className="space-y-3">
          {items.map((sale) => (
            <Link key={sale.id} href={`/ventas/${sale.id}`} className="block">
              <Card className="hover:border-slate-300 transition-colors">
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        #{sale.folio} · {sale.items.map((i) => i.product.name).join(", ")}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {fmt.dateTime(sale.createdAt)} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                        {sale.paymentReference && ` (ref. ${sale.paymentReference})`}
                        {sale.customer && ` · ${sale.customer.name}`}
                      </p>
                      <div className="flex gap-1 mt-1">
                        {sale.status === "CANCELLED" && <Badge tone="red">{tr("Cancelada")}</Badge>}
                        {sale.returns.length > 0 && <Badge tone="amber">{tr("Con devolución")}</Badge>}
                        {sale.invoice?.status === "STAMPED" && <Badge tone="blue">{tr("Facturada")}</Badge>}
                      </div>
                    </div>
                    <p
                      className={`font-semibold tabular-nums ${sale.status === "CANCELLED" ? "line-through text-slate-400" : "text-brand-600"}`}
                    >
                      {fmt.money(sale.total)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          <LoadMore hasMore={hasMore} loading={loadingMore} onClick={loadMore} />
        </div>
      )}
    </div>
  );
}
