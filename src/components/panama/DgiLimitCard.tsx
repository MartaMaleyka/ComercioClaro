"use client";

import { useText } from "@/lib/client/i18n";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface DgiStatus {
  year: number;
  limits: { annualRevenue: number; monthlyDocuments: number };
  revenue: number;
  revenueRatio: number;
  documents: number;
  documentsRatio: number;
  documentsBasis: "pac" | "perSale" | "registered";
  monthSales: number;
  monthReturns: number;
  projectedAnnualRevenue: number;
  status: "ok" | "warning" | "exceeded";
}

function Meter({ label, value, ratio, detail }: { label: string; value: string; ratio: number; detail: string }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900 tabular-nums">{value}</span>
      </div>
      <div
        className="h-2 rounded-full bg-slate-100"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-2 rounded-full", ratio >= 1 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-brand-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}

/** Uso de los límites del facturador gratuito de la DGI (Panamá). */
export function DgiLimitCard({ compact = false }: { compact?: boolean }) {
  const tr = useText();
  const fmt = useFormat();
  const { data } = useSWR<DgiStatus>("/api/invoices/dgi-status", fetcher);
  if (!data) return null;
  if (compact && data.status === "ok") return null;

  const Icon = data.status === "exceeded" ? FileWarning : data.status === "warning" ? AlertTriangle : CheckCircle2;
  const message =
    data.status === "exceeded"
      ? "Superaste un límite del facturador gratuito: debes facturar con un PAC."
      : data.status === "warning"
        ? "Estás cerca de un límite del facturador gratuito. Prepara la contratación de un PAC."
        : "Dentro de los límites del facturador gratuito.";

  return (
    <Card
      className={cn(data.status === "exceeded" && "border-red-200", data.status === "warning" && "border-amber-200")}
    >
      <CardContent className="space-y-3">
        <p
          className={cn(
            "flex items-center gap-2 text-sm font-medium",
            data.status === "exceeded"
              ? "text-red-600"
              : data.status === "warning"
                ? "text-amber-700"
                : "text-brand-700 dark:text-brand-300"
          )}
        >
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {message}
        </p>
        <Meter
          label={`Ingresos ${data.year}`}
          value={`${fmt.money(data.revenue)} / ${fmt.money(data.limits.annualRevenue)}`}
          ratio={data.revenueRatio}
          detail={tr("A este ritmo cerrarías el año en {amount}.", { amount: fmt.money(data.projectedAnnualRevenue) })}
        />
        <Meter
          label={tr("Documentos emitidos este mes")}
          value={`${data.documents} / ${data.limits.monthlyDocuments}`}
          ratio={data.documentsRatio}
          detail={
            data.documentsBasis === "pac"
              ? tr("Conteo exacto: facturas emitidas desde ComercioClaro con tu PAC.")
              : data.documentsBasis === "perSale"
                ? tr("Cuenta cada venta ({sales}) y cada devolución como nota de crédito ({returns}).", {
                    sales: data.monthSales,
                    returns: data.monthReturns,
                  })
                : tr(
                    "Solo cuenta facturas con CUFE registrado. Llevas {n} ventas este mes; si facturas cada venta, actívalo en Configuración.",
                    { n: data.monthSales }
                  )
          }
        />
        {!compact && (
          <p className="text-xs text-slate-500">
            {tr(
              "Límites de la Resolución DGI 201-6299 (desde el 1 de enero de 2026): hasta B/.36,000 de ingresos al año y 100 documentos al mes."
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
