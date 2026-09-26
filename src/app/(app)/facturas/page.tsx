"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { usePaginated } from "@/lib/client/hooks";
import { useFormat, todayKey } from "@/lib/client/format";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { DgiLimitCard } from "@/components/panama/DgiLimitCard";
import { countryConfig } from "@/lib/country";
import { ErrorState, ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

interface Invoice {
  id: string;
  kind: "INDIVIDUAL" | "GLOBAL";
  status: "PENDING" | "STAMPED" | "CANCELLED" | "ERROR";
  provider: string;
  uuid: string | null;
  total: number;
  error: string | null;
  periodicity: string | null;
  createdAt: string;
  customer: { name: string; rfc: string | null } | null;
  _count: { sales: number };
}

const STATUS: Record<Invoice["status"], { label: string; tone: "green" | "gray" | "red" | "amber" }> = {
  STAMPED: { label: "Timbrada", tone: "green" },
  PENDING: { label: "Pendiente", tone: "amber" },
  CANCELLED: { label: "Cancelada", tone: "gray" },
  ERROR: { label: "Error", tone: "red" },
};

export default function InvoicesPage() {
  const { business } = useSession();
  const country = countryConfig(business.country);
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const list = usePaginated<Invoice>("/api/invoices");
  const configured = (list.data?.[0] as { configured?: boolean } | undefined)?.configured;
  const [from, setFrom] = useState(todayKey(business.timezone, -1));
  const [to, setTo] = useState(todayKey(business.timezone, -1));
  const [periodicity, setPeriodicity] = useState("01");
  const [busy, setBusy] = useState(false);

  async function global(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/invoices/global", { body: { from, to, periodicity } });
      toast.success("Factura global timbrada");
      list.mutate();
    } catch (err) {
      toast.error(err);
      list.mutate();
    } finally {
      setBusy(false);
    }
  }

  async function cancel(inv: Invoice) {
    if (
      !(await confirm({
        title: "Cancelar factura ante el SAT",
        message:
          "Motivo 02: comprobante emitido con errores sin relación. Las ventas quedarán libres para facturarse de nuevo.",
        danger: true,
        confirmLabel: "Cancelar factura",
      }))
    )
      return;
    try {
      await api(`/api/invoices/${inv.id}/cancel`, { body: {} });
      toast.success("Factura cancelada");
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      {country.code === "PA" ? (
        <>
          <PageHeader
            title="Facturas (DGI Panamá)"
            description="Control de facturas electrónicas y de los límites del facturador gratuito"
          />
          <DgiLimitCard />
          <p className="text-sm text-slate-500">
            Emite la factura en el facturador gratuito de la DGI o con tu PAC y luego abre la venta en{" "}
            <Link href="/ventas/historial" className="underline">
              Ventas
            </Link>{" "}
            y usa &quot;Registrar CUFE&quot;. Así sabrás qué ventas ya están facturadas. La conexión directa con un PAC
            se activará cuando elijas proveedor.
          </p>
        </>
      ) : country.code === "MX" ? (
        <>
          <PageHeader
            title="Facturas (CFDI 4.0)"
            description="Facturas a clientes y factura global al público en general"
          />
          {configured === false && (
            <div className="rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">
              La facturación no está activa. Contrata un PAC (por ejemplo Facturama) y configura{" "}
              <code>FACTURAMA_USER</code> y <code>FACTURAMA_PASSWORD</code> en el servidor. También completa los datos
              fiscales en{" "}
              <Link href="/configuracion" className="underline">
                Configuración
              </Link>
              .
            </div>
          )}

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">Factura global (público en general)</h2>
              <p className="text-sm text-slate-500">
                Agrupa las ventas sin factura del periodo con el RFC XAXX010101000. Debe emitirse dentro de las 24 horas
                siguientes al cierre del periodo.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={global} className="grid sm:grid-cols-4 gap-2 items-end">
                <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                <Select label="Periodicidad" value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
                  <option value="01">Diaria</option>
                  <option value="02">Semanal</option>
                  <option value="03">Quincenal</option>
                  <option value="04">Mensual</option>
                  <option value="05">Bimestral</option>
                </Select>
                <Button type="submit" loading={busy}>
                  Timbrar global
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-sm text-slate-500">
            Para facturar una venta a un cliente abre la venta en{" "}
            <Link href="/ventas/historial" className="underline">
              Ventas
            </Link>{" "}
            y usa &quot;Facturar&quot;.
          </p>
        </>
      ) : (
        <PageHeader title="Facturas" description="La facturación electrónica está disponible para México y Panamá." />
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.mutate()} />
      ) : list.isLoading ? (
        <ListSkeleton />
      ) : list.items.length === 0 ? (
        <EmptyState icon={FileText} title="Sin facturas" description="Aquí aparecerán las facturas timbradas." />
      ) : (
        <div className="space-y-2">
          {list.items.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {inv.kind === "GLOBAL" ? "Global · público en general" : (inv.customer?.name ?? "Consumidor final")}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {fmt.dateTime(inv.createdAt)} · {inv._count.sales} venta(s)
                    {inv.uuid && ` · ${inv.uuid}`}
                  </p>
                  <Badge tone={STATUS[inv.status].tone} className="mt-1">
                    {STATUS[inv.status].label}
                  </Badge>
                  {inv.error && <p className="text-xs text-red-600 mt-1">{inv.error}</p>}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="font-semibold tabular-nums">{fmt.money(inv.total)}</p>
                  {inv.status === "STAMPED" && (
                    <div className="flex gap-2 text-xs justify-end">
                      {inv.provider === "facturama" && (
                        <>
                          <a
                            href={`/api/invoices/${inv.id}/download?format=pdf`}
                            className="underline text-brand-700 dark:text-brand-300"
                          >
                            PDF
                          </a>
                          <a
                            href={`/api/invoices/${inv.id}/download?format=xml`}
                            className="underline text-brand-700 dark:text-brand-300"
                          >
                            XML
                          </a>
                        </>
                      )}
                      <button onClick={() => cancel(inv)} className="text-red-600 inline-flex items-center gap-0.5">
                        <XCircle className="w-3 h-3" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}
    </div>
  );
}
