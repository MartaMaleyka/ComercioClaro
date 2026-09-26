"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { fetcher, withQuery } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import { PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import type { FeatureKey } from "@/lib/features";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState, ListSkeleton, PageHeader, Stat } from "@/components/ui/Misc";
import { TaxesView } from "@/components/reports/TaxesView";
import { TeamView } from "@/components/reports/TeamView";
import { SeniorsView } from "@/components/reports/SeniorsView";
import { ReconciliationView } from "@/components/reports/ReconciliationView";

interface Report {
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
  returns: number;
  discounts: number;
  purchases: number;
  salesCount: number;
  averageTicket: number;
  byPaymentMethod: { method: string; total: number; count: number }[];
  fees: { items: { method: string; rate: number; amount: number }[]; total: number };
  netAfterFees: number;
  serviceCommissions?: number;
  trends: {
    date: string;
    sales: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    purchases: number;
  }[];
  bestSellers: { productId: string; name: string; unit: string; quantity: number; revenue: number; profit: number }[];
  byCategory: { category: string; revenue: number; profit: number }[];
  expensesByCategory: { category: string; amount: number }[];
}

interface Consolidated {
  branches: {
    businessId: string;
    name: string;
    revenue: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    purchases: number;
  }[];
  totals: { revenue: number; grossProfit: number; expenses: number; netProfit: number; purchases: number };
  mixedCurrencies: boolean;
}

const PERIODS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "custom", label: "Fechas" },
];

const axisStyle = { fontSize: 11, fill: "var(--chart-text)" };
const tooltipStyle = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    color: "var(--color-text)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--color-text-secondary)" },
  // El color de la serie queda en la marca; el texto usa el color normal para cumplir el contraste.
  itemStyle: { color: "var(--color-text)" },
};

export default function ReportsPage() {
  const tr = useText();
  const { business, businesses } = useSession();
  const has = (feature: FeatureKey) => business.features.includes(feature);
  const fmt = useFormat();
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState(todayKey(business.timezone, -29));
  const [to, setTo] = useState(todayKey(business.timezone));
  const [scope, setScope] = useState<"business" | "all">("business");
  const [showTable, setShowTable] = useState(false);
  const [view, setView] = useState<"summary" | "taxes" | "seniors" | "team" | "reconcile">("summary");

  const query = period === "custom" ? { from, to } : { period };
  const { data, error, mutate } = useSWR<Report>(
    view === "summary" && scope === "business" ? withQuery("/api/reports", query) : null,
    fetcher
  );
  const consolidated = useSWR<Consolidated>(
    view === "summary" && scope === "all" ? withQuery("/api/reports", { ...query, scope: "all" }) : null,
    fetcher
  );
  const ownedBranches = businesses.filter((b) => b.role === "OWNER").length;

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(fmt.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T00:00:00Z`)
    );
  const compactMoney = (n: number) =>
    new Intl.NumberFormat(fmt.locale, {
      style: "currency",
      currency: fmt.currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Reportes")}
        description={tr("Ventas, utilidad real y lo que más se vende")}
        actions={
          data &&
          business.features.includes("export") && (
            <a
              href={withQuery("/api/export/sale-items", { from: data.from, to: data.to })}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> {tr("Detalle CSV")}
            </a>
          )
        }
      />

      <Tabs
        label={tr("Tipo de reporte")}
        tabs={[
          { value: "summary", label: tr("Resumen") },
          ...(has("advancedReports") ? [{ value: "taxes" as const, label: tr("Impuestos") }] : []),
          ...(business.seniorDiscountRate > 0 ? [{ value: "seniors" as const, label: tr("Jubilados") }] : []),
          ...(has("advancedReports") ? [{ value: "team" as const, label: tr("Equipo") }] : []),
          ...(has("reconciliation") ? [{ value: "reconcile" as const, label: tr("Conciliación") }] : []),
        ]}
        value={view}
        onChange={setView}
      />

      {view === "reconcile" ? (
        <ReconciliationView />
      ) : view === "taxes" ? (
        <TaxesView />
      ) : view === "seniors" ? (
        <SeniorsView />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <div
              className="inline-flex rounded-xl border border-slate-200 p-1 bg-surface"
              role="radiogroup"
              aria-label={tr("Periodo")}
            >
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  role="radio"
                  aria-checked={period === p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${period === p.value ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {tr(p.label)}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <>
                <Input type="date" aria-label={tr("Desde")} value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" aria-label={tr("Hasta")} value={to} onChange={(e) => setTo(e.target.value)} />
              </>
            )}
          </div>

          {view === "team" ? (
            <TeamView query={Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))} />
          ) : (
            <>
              {ownedBranches > 1 && (
                <Tabs
                  tabs={[
                    { value: "business", label: business.name },
                    { value: "all", label: tr("Todas las sucursales") },
                  ]}
                  value={scope}
                  onChange={setScope}
                />
              )}

              {scope === "all" ? (
                consolidated.error ? (
                  <ErrorState error={consolidated.error} />
                ) : !consolidated.data ? (
                  <ListSkeleton />
                ) : (
                  <ConsolidatedView data={consolidated.data} />
                )
              ) : error ? (
                <ErrorState error={error} onRetry={() => mutate()} />
              ) : !data ? (
                <ListSkeleton rows={6} />
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat
                      label={tr("Ventas netas")}
                      value={fmt.money(data.revenue)}
                      hint={tr("{n} ventas · ticket {amount}", {
                        n: data.salesCount,
                        amount: fmt.money(data.averageTicket),
                      })}
                    />
                    <Stat label={tr("Costo de lo vendido")} value={fmt.money(data.cogs)} />
                    <Stat
                      label={tr("Utilidad bruta")}
                      value={fmt.money(data.grossProfit)}
                      hint={`Margen ${data.grossMargin}%`}
                      tone="positive"
                    />
                    <Stat
                      label={tr("Ganancia neta")}
                      value={fmt.money(data.netProfit)}
                      hint={
                        (data.serviceCommissions ?? 0) > 0
                          ? tr("Gastos {expenses} · comisiones de recargas {commissions}", {
                              expenses: fmt.money(data.expenses),
                              commissions: fmt.money(data.serviceCommissions),
                            })
                          : tr("Gastos {expenses}", { expenses: fmt.money(data.expenses) })
                      }
                      tone={data.netProfit >= 0 ? "positive" : "negative"}
                    />
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat label={tr("Compras (salida de dinero)")} value={fmt.money(data.purchases)} />
                    <Stat label={tr("Devoluciones")} value={fmt.money(data.returns)} />
                    <Stat
                      label={tr("Comisiones estimadas")}
                      value={fmt.money(data.fees.total)}
                      hint={
                        data.fees.items.length > 0
                          ? `${data.fees.items.map((f) => `${tr(PAYMENT_METHOD_LABELS[f.method])} ${Math.round(f.rate * 10000) / 100}%`).join(" · ")} · ${tr("neto")} ${fmt.money(data.netAfterFees)}`
                          : tr("Configura las comisiones en Configuración")
                      }
                    />
                    <Stat
                      label={tr("Por forma de pago")}
                      value={
                        <span className="text-sm font-medium block space-y-0.5">
                          {data.byPaymentMethod.map((m) => (
                            <span key={m.method} className="flex justify-between gap-2">
                              <span className="text-slate-500">{tr(PAYMENT_METHOD_LABELS[m.method])}</span>
                              {fmt.money(m.total)}
                            </span>
                          ))}
                        </span>
                      }
                    />
                  </div>

                  <Card>
                    <CardHeader className="flex items-center justify-between">
                      <h2 className="font-semibold text-slate-900">{tr("Ventas y ganancia neta por día")}</h2>
                      <button
                        onClick={() => setShowTable((v) => !v)}
                        className="text-sm text-brand-700 dark:text-brand-300 underline"
                      >
                        {showTable ? tr("Ver gráfica") : tr("Ver tabla")}
                      </button>
                    </CardHeader>
                    <CardContent>
                      {showTable ? (
                        <div className="max-h-80 overflow-y-auto">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[420px]">
                              <thead className="sticky top-0 bg-surface">
                                <tr className="text-left text-xs text-slate-500">
                                  <th className="py-1 font-medium">{tr("Día")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Ventas")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Utilidad bruta")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Gastos")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Ganancia neta")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {data.trends.map((t) => (
                                  <tr key={t.date}>
                                    <td className="py-1.5">{dayLabel(t.date)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt.money(t.sales)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt.money(t.grossProfit)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt.money(t.expenses)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{fmt.money(t.netProfit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="h-64" role="img" aria-label={tr("Gráfica de ventas y ganancia neta por día")}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tickFormatter={dayLabel}
                                tick={axisStyle}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={24}
                              />
                              <YAxis
                                tickFormatter={compactMoney}
                                tick={axisStyle}
                                axisLine={false}
                                tickLine={false}
                                width={56}
                              />
                              <Tooltip
                                {...tooltipStyle}
                                labelFormatter={(d) => dayLabel(String(d))}
                                formatter={(v) => fmt.money(Number(v))}
                              />
                              <Legend
                                wrapperStyle={{ fontSize: 12 }}
                                formatter={(value) => <span style={{ color: "var(--chart-text)" }}>{value}</span>}
                              />
                              <Line
                                type="monotone"
                                dataKey="sales"
                                name={tr("Ventas")}
                                stroke="var(--series-1)"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 5 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="netProfit"
                                name={tr("Ganancia neta")}
                                stroke="var(--series-2)"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 5 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <h2 className="font-semibold text-slate-900">{tr("Más vendidos")}</h2>
                      </CardHeader>
                      <CardContent>
                        {data.bestSellers.length === 0 ? (
                          <p className="text-sm text-slate-500">{tr("Sin ventas en el periodo.")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[420px]">
                              <thead>
                                <tr className="text-left text-xs text-slate-500">
                                  <th className="py-1 font-medium">{tr("Producto")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Vendido")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Ventas")}</th>
                                  <th className="py-1 font-medium text-right">{tr("Utilidad")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {data.bestSellers.map((p) => (
                                  <tr key={p.productId}>
                                    <td className="py-2 text-slate-900">{p.name}</td>
                                    <td className="py-2 text-right tabular-nums">
                                      {fmt.number(p.quantity)} {UNIT_LABELS[p.unit]}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">{fmt.money(p.revenue)}</td>
                                    <td
                                      className={`py-2 text-right tabular-nums ${p.profit < 0 ? "text-red-600" : "text-brand-600"}`}
                                    >
                                      {fmt.money(p.profit)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <h2 className="font-semibold text-slate-900">{tr("Utilidad por categoría")}</h2>
                      </CardHeader>
                      <CardContent>
                        {data.byCategory.length === 0 ? (
                          <p className="text-sm text-slate-500">{tr("Sin ventas en el periodo.")}</p>
                        ) : (
                          <div
                            style={{ height: Math.max(120, data.byCategory.length * 36) }}
                            role="img"
                            aria-label={tr("Utilidad bruta por categoría")}
                          >
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={data.byCategory}
                                layout="vertical"
                                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                                <XAxis
                                  type="number"
                                  tickFormatter={compactMoney}
                                  tick={axisStyle}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="category"
                                  tick={axisStyle}
                                  axisLine={false}
                                  tickLine={false}
                                  width={96}
                                />
                                <Tooltip
                                  {...tooltipStyle}
                                  cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
                                  formatter={(v) => fmt.money(Number(v))}
                                />
                                <Bar
                                  dataKey="profit"
                                  name={tr("Utilidad bruta")}
                                  fill="var(--series-1)"
                                  radius={[0, 4, 4, 0]}
                                  barSize={16}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <h2 className="font-semibold text-slate-900">{tr("Gastos por categoría")}</h2>
                      </CardHeader>
                      <CardContent>
                        {data.expensesByCategory.length === 0 ? (
                          <p className="text-sm text-slate-500">{tr("Sin gastos registrados en el periodo.")}</p>
                        ) : (
                          <div className="space-y-2">
                            {data.expensesByCategory.map((e) => (
                              <div key={e.category} className="text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-700">{e.category}</span>
                                  <span className="tabular-nums text-slate-900">{fmt.money(e.amount)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 mt-1" aria-hidden="true">
                                  <div
                                    className="h-2 rounded-full"
                                    style={{
                                      width: `${(e.amount / data.expenses) * 100}%`,
                                      background: "var(--series-1)",
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ConsolidatedView({ data }: { data: Consolidated }) {
  const tr = useText();
  const fmt = useFormat();
  return (
    <Card>
      <CardContent>
        {data.mixedCurrencies && (
          <p className="text-sm text-amber-700 mb-3">
            {tr("Las sucursales usan monedas distintas; los totales suman importes sin convertir.")}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-medium">{tr("Sucursal")}</th>
                <th className="py-1 font-medium text-right">{tr("Ventas")}</th>
                <th className="py-1 font-medium text-right">{tr("Utilidad bruta")}</th>
                <th className="py-1 font-medium text-right">{tr("Gastos")}</th>
                <th className="py-1 font-medium text-right">{tr("Ganancia neta")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.branches.map((b) => (
                <tr key={b.businessId}>
                  <td className="py-2 text-slate-900">{b.name}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(b.revenue)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(b.grossProfit)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt.money(b.expenses)}</td>
                  <td className={`py-2 text-right tabular-nums ${b.netProfit < 0 ? "text-red-600" : "text-brand-600"}`}>
                    {fmt.money(b.netProfit)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">{tr("Total")}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.revenue)}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.grossProfit)}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.expenses)}</td>
                <td className="py-2 text-right tabular-nums">{fmt.money(data.totals.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
