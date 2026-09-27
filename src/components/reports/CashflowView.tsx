"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, ListSkeleton, Stat, ScrollArea } from "@/components/ui/Misc";

interface Week {
  start: string;
  end: string;
  sales: number;
  collections: number;
  payables: number;
  recurring: number;
  purchases: number;
  payroll: number;
  inflows: number;
  outflows: number;
  net: number;
  balance: number;
}

interface Projection {
  from: string;
  to: string;
  opening: number;
  openingSource: "input" | "cash" | "none";
  weeks: Week[];
  totals: { inflows: number; outflows: number };
  closing: number;
  negativeWeek: { start: string; balance: number } | null;
}

interface BreakEven {
  revenue: number;
  marginPercent: number;
  fixedCosts: number;
  fixedSource: "recurring" | "expenses";
  recurring: number;
  payroll: number;
  breakEvenSales: number | null;
  dailySales: number;
  daysNeeded: number | null;
  daysInMonth: number;
  reachable: boolean;
  month: { sales: number; progress: number | null; reached: boolean };
}

const DAYS = [30, 60, 90] as const;

/** Flujo de caja proyectado (semana a semana) y punto de equilibrio del mes. */
export function CashflowView() {
  const tr = useText();
  const fmt = useFormat();
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const [opening, setOpening] = useState("");
  const openingValue = opening.trim() === "" ? undefined : Number(opening.replace(",", "."));
  const projection = useSWR<Projection>(
    withQuery("/api/reports/cashflow", {
      days,
      opening: openingValue !== undefined && Number.isFinite(openingValue) ? openingValue : undefined,
    }),
    fetcher
  );
  const breakEven = useSWR<BreakEven>("/api/reports/break-even", fetcher);
  const day = (key: string) =>
    new Intl.DateTimeFormat(fmt.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${key}T00:00:00Z`)
    );

  return (
    <div className="space-y-5">
      <section aria-labelledby="equilibrio-title" className="space-y-3">
        <h2 id="equilibrio-title" className="font-semibold text-slate-900">
          {tr("Punto de equilibrio del mes")}
        </h2>
        {breakEven.error ? (
          <ErrorState error={breakEven.error} onRetry={() => breakEven.mutate()} />
        ) : !breakEven.data ? (
          <ListSkeleton rows={2} />
        ) : (
          <BreakEvenCard data={breakEven.data} />
        )}
      </section>

      <section aria-labelledby="flujo-title" className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 id="flujo-title" className="font-semibold text-slate-900">
            {tr("Flujo de caja proyectado")}
          </h2>
          <div className="flex items-end gap-2 flex-wrap">
            <div
              className="inline-flex rounded-xl border border-slate-200 p-1 bg-surface"
              role="radiogroup"
              aria-label={tr("Periodo de la proyección")}
            >
              {DAYS.map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={days === d}
                  onClick={() => setDays(d)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm",
                    days === d ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {tr("{n} días", { n: d })}
                </button>
              ))}
            </div>
            <div className="w-40">
              <Input
                label={tr("Saldo inicial")}
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder={projection.data ? projection.data.opening.toFixed(2) : "0.00"}
              />
            </div>
          </div>
        </div>
        {projection.error ? (
          <ErrorState error={projection.error} onRetry={() => projection.mutate()} />
        ) : !projection.data ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {projection.data.openingSource !== "input" && (
              <p className="text-xs text-slate-500">
                {projection.data.openingSource === "cash"
                  ? tr(
                      "Saldo inicial: el efectivo esperado en la caja abierta. Escribe el total de caja y banco para afinarlo."
                    )
                  : tr("Sin caja abierta el saldo inicial es 0. Escribe el total de caja y banco para afinarlo.")}
              </p>
            )}
            {projection.data.negativeWeek && (
              <p role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {tr(
                  "El saldo quedaría en {amount} la semana del {date}. Adelanta cobros de fiado o negocia fechas con tus proveedores.",
                  {
                    amount: fmt.money(projection.data.negativeWeek.balance),
                    date: day(projection.data.negativeWeek.start),
                  }
                )}
              </p>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label={tr("Saldo inicial")} value={fmt.money(projection.data.opening)} />
              <Stat label={tr("Entradas")} value={fmt.money(projection.data.totals.inflows)} tone="positive" />
              <Stat label={tr("Salidas")} value={fmt.money(projection.data.totals.outflows)} tone="warning" />
              <Stat
                label={tr("Saldo al final")}
                value={fmt.money(projection.data.closing)}
                tone={projection.data.closing < 0 ? "negative" : "default"}
              />
            </div>
            <Card>
              <CardContent>
                <ScrollArea label={tr("Flujo de caja proyectado")}>
                  <table className="w-full text-sm min-w-[760px]">
                    <caption className="sr-only">{tr("Flujo de caja proyectado")}</caption>
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th scope="col" className="py-1 font-medium">
                          {tr("Semana")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Ventas")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Cobros de fiado")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Por pagar")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Gastos fijos")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Compras")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Planilla")}
                        </th>
                        <th scope="col" className="py-1 font-medium text-right">
                          {tr("Saldo")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projection.data.weeks.map((w) => (
                        <tr key={w.start}>
                          <th scope="row" className="py-2 text-left font-normal text-slate-900 whitespace-nowrap">
                            {day(w.start)} – {day(w.end)}
                          </th>
                          <td className="py-2 text-right tabular-nums">{fmt.money(w.sales)}</td>
                          <td className="py-2 text-right tabular-nums">{fmt.money(w.collections)}</td>
                          <td className="py-2 text-right tabular-nums">−{fmt.money(w.payables)}</td>
                          <td className="py-2 text-right tabular-nums">−{fmt.money(w.recurring)}</td>
                          <td className="py-2 text-right tabular-nums">−{fmt.money(w.purchases)}</td>
                          <td className="py-2 text-right tabular-nums">−{fmt.money(w.payroll)}</td>
                          <td
                            className={cn(
                              "py-2 text-right tabular-nums font-semibold",
                              w.balance < 0 ? "text-red-600" : "text-slate-900"
                            )}
                          >
                            {fmt.money(w.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
                <p className="text-xs text-slate-500 mt-2">
                  {tr(
                    "Ventas: promedio cobrado por día de la semana en las últimas 8 semanas (sin fiado ni vales). Compras: promedio de las compras de contado. Lo vencido se cuenta en la primera semana."
                  )}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>
    </div>
  );
}

function BreakEvenCard({ data }: { data: BreakEven }) {
  const tr = useText();
  const fmt = useFormat();
  const progress = Math.min(100, Math.max(0, data.month.progress ?? 0));
  if (data.breakEvenSales === null) {
    return (
      <p className="text-sm text-slate-500">
        {tr("Aún no hay ventas con margen en los últimos 90 días para calcular el punto de equilibrio.")}
      </p>
    );
  }
  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-slate-600">
          {tr("Para cubrir tus gastos fijos necesitas vender {amount} al mes.", {
            amount: fmt.money(data.breakEvenSales),
          })}{" "}
          {data.daysNeeded !== null &&
            (data.reachable
              ? tr("A tu ritmo actual lo alcanzas el día {n} del mes.", { n: data.daysNeeded })
              : tr("A tu ritmo actual necesitarías {n} días: más de los que tiene el mes.", { n: data.daysNeeded }))}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label={tr("Margen de contribución")}
            value={`${data.marginPercent}%`}
            hint={tr("Ventas menos costo real y comisiones")}
          />
          <Stat
            label={tr("Gastos fijos del mes")}
            value={fmt.money(data.fixedCosts)}
            hint={
              data.fixedSource === "recurring" ? (
                tr("Gastos recurrentes y planilla")
              ) : (
                <Link href="/gastos?tab=recurrentes" className="underline">
                  {tr("Promedio de tus gastos; registra los recurrentes")}
                </Link>
              )
            }
          />
          <Stat label={tr("Ventas para no perder")} value={fmt.money(data.breakEvenSales)} tone="warning" />
          <Stat label={tr("Venta diaria promedio")} value={fmt.money(data.dailySales)} />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">{tr("Vendido este mes")}</span>
            <span className="tabular-nums font-medium text-slate-900">
              {fmt.money(data.month.sales)} / {fmt.money(data.breakEvenSales)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={tr("Avance hacia el punto de equilibrio")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-3 rounded-full bg-slate-100 overflow-hidden"
          >
            <div
              className={cn("h-full rounded-full", data.month.reached ? "bg-brand-600" : "bg-amber-500")}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {data.month.reached
              ? tr("Ya cubriste tus gastos fijos del mes: lo que sigue es ganancia.")
              : tr("{n}% del punto de equilibrio", { n: progress })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
