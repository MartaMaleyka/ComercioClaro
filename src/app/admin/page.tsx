"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { ErrorState, ListSkeleton, PageHeader, ScrollArea, Stat } from "@/components/ui/Misc";
import { businessTypeLabel } from "@/lib/business-types";

interface Amount {
  currency: string;
  amount: number;
}

/** Montos en varias monedas: "$120.00 · MX$300.00" (sin mezclarlas). */
const amounts = (list: Amount[]) =>
  list.length === 0 ? adminFmt.money(0) : list.map((a) => adminFmt.money(a.amount, a.currency)).join(" · ");

interface Overview {
  businesses: number;
  byStatus: {
    ACTIVE: number;
    TRIAL: number;
    SUSPENDED: number;
    PENDING: number;
    CLOSED: number;
    OVERDUE: number;
    TRIAL_ENDED: number;
  };
  funnel: { week: string; registered: number; selfSignup: number; sold: number; paid: number; closed: number }[];
  recent: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    businessType: string | null;
    signupSource: string | null;
    planName: string | null;
  }[];
  pending: { id: string; name: string; createdAt: string; businessType: string | null }[];
  mrr: Amount[];
  collectedThisMonth: Amount[];
  collectedByMonth: { month: string; amounts: Record<string, number> }[];
  byPlan: { id: string | null; name: string | null; count: number }[];
  users: number;
  newBusinesses: number;
  sales30: { currency: string; count: number; total: number }[];
  trialsEnding: { id: string; name: string; trialEndsAt: string }[];
  overdue: { id: string; name: string; paidUntil: string }[];
}

export default function AdminOverviewPage() {
  const tr = useText();
  const { data, error, mutate } = useSWR<Overview>("/api/admin/overview", fetcher);
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={4} />;
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat("es-PA", { month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${m}-01T00:00:00Z`)
    );

  return (
    <div className="space-y-5">
      <PageHeader title={tr("Resumen de la plataforma")} description={tr("Suscripciones, cobros y negocios")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label={tr("Ingreso mensual recurrente")}
          value={amounts(data.mrr)}
          hint={tr("Negocios activos con plan")}
          tone="positive"
        />
        <Stat label={tr("Cobrado este mes")} value={amounts(data.collectedThisMonth)} />
        <Stat
          label={tr("Negocios")}
          value={data.businesses}
          hint={tr("{n} nuevos en 30 días", { n: data.newBusinesses })}
        />
        <Stat label={tr("Usuarios")} value={data.users} />
        <Stat label={tr("Activos")} value={data.byStatus.ACTIVE} tone="positive" />
        <Stat
          label={tr("En prueba")}
          value={data.byStatus.TRIAL}
          hint={
            data.byStatus.TRIAL_ENDED > 0
              ? tr("{n} con la prueba vencida", { n: data.byStatus.TRIAL_ENDED })
              : undefined
          }
        />
        <Stat
          label={tr("Pago vencido")}
          value={data.byStatus.OVERDUE}
          tone={data.byStatus.OVERDUE > 0 ? "warning" : "default"}
        />
        <Stat
          label={tr("Suspendidos")}
          value={data.byStatus.SUSPENDED}
          tone={data.byStatus.SUSPENDED > 0 ? "negative" : "default"}
          hint={data.byStatus.CLOSED > 0 ? tr("{n} dados de baja", { n: data.byStatus.CLOSED }) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Requieren atención")}</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.overdue.length === 0 && data.trialsEnding.length === 0 && data.pending.length === 0 && (
              <p className="text-slate-500">{tr("Todo al día.")}</p>
            )}
            {data.pending.map((b) => (
              <Link
                key={b.id}
                href={`/admin/negocios/${b.id}`}
                className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{b.name}</span>
                <span className="text-purple-700">
                  {tr("Espera aprobación desde el {date}", { date: adminFmt.date(b.createdAt) })}
                </span>
              </Link>
            ))}
            {data.overdue.map((b) => (
              <Link
                key={b.id}
                href={`/admin/negocios/${b.id}`}
                className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{b.name}</span>
                <span className="text-amber-700">
                  {tr("Pago vencido desde {date}", { date: adminFmt.date(b.paidUntil) })}
                </span>
              </Link>
            ))}
            {data.trialsEnding.map((b) => (
              <Link
                key={b.id}
                href={`/admin/negocios/${b.id}`}
                className="flex justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{b.name}</span>
                <span className="text-blue-700">
                  {tr("Prueba termina el {date}", { date: adminFmt.date(b.trialEndsAt) })}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Negocios por plan")}</h2>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100 text-sm">
              {data.byPlan
                .filter((p) => p.id || p.count > 0)
                .map((p) => (
                  <li key={p.id ?? "none"} className="flex justify-between py-2">
                    <Link
                      href={`/admin/negocios?planId=${p.id ?? "none"}`}
                      className="text-brand-700 dark:text-brand-300 hover:underline"
                    >
                      {p.name ?? tr("Sin plan (todas las funciones)")}
                    </Link>
                    <span className="tabular-nums font-medium">{p.count}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Registros por semana")}</h2>
            <p className="text-sm text-slate-500">
              {tr(
                "De los negocios registrados cada semana: cuántos ya vendieron, cuántos pagaron y cuántos se dieron de baja."
              )}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea label={tr("Registros por semana")}>
              <table className="w-full text-sm">
                <caption className="sr-only">{tr("Registros por semana")}</caption>
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th scope="col" className="py-1 font-medium">
                      {tr("Semana del")}
                    </th>
                    <th scope="col" className="py-1 font-medium text-right">
                      {tr("Registrados")}
                    </th>
                    <th scope="col" className="py-1 font-medium text-right">
                      {tr("Vendieron")}
                    </th>
                    <th scope="col" className="py-1 font-medium text-right">
                      {tr("Pagaron")}
                    </th>
                    <th scope="col" className="py-1 font-medium text-right">
                      {tr("Bajas")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.funnel].reverse().map((w) => {
                    const pct = (n: number) => (w.registered > 0 ? ` (${Math.round((n / w.registered) * 100)}%)` : "");
                    return (
                      <tr key={w.week}>
                        <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
                          {adminFmt.date(`${w.week}T12:00:00Z`)}
                        </th>
                        <td className="py-1.5 text-right tabular-nums font-medium">{w.registered}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {w.sold}
                          <span className="text-xs text-slate-500">{pct(w.sold)}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {w.paid}
                          <span className="text-xs text-slate-500">{pct(w.paid)}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{w.closed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Registros recientes")}</h2>
            <p className="text-sm text-slate-500">{tr("Últimos 7 días")}</p>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("Sin registros nuevos esta semana.")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.recent.map((b) => (
                  <li key={b.id} className="py-2 flex justify-between gap-2">
                    <span className="min-w-0">
                      <Link
                        href={`/admin/negocios/${b.id}`}
                        className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {[
                          b.businessType ? tr(businessTypeLabel(b.businessType) ?? "") : null,
                          b.planName,
                          b.signupSource === "ADMIN" ? tr("Alta del admin") : tr("Registro propio"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">{adminFmt.date(b.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/negocios"
              className="mt-2 inline-block text-sm text-brand-700 dark:text-brand-300 underline"
            >
              {tr("Ver todos los negocios")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Cobrado por mes")}</h2>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <caption className="sr-only">{tr("Cobrado por mes")}</caption>
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th scope="col" className="py-1 font-medium">
                    {tr("Mes")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Cobrado")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...data.collectedByMonth].reverse().map((m) => (
                  <tr key={m.month}>
                    <th scope="row" className="py-1.5 text-left font-normal text-slate-700 capitalize">
                      {monthLabel(m.month)}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">
                      {amounts(Object.entries(m.amounts).map(([currency, amount]) => ({ currency, amount })))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Uso de la plataforma")}</h2>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="text-slate-500">{tr("Ventas de los negocios en los últimos 30 días, por moneda.")}</p>
            {data.sales30.length === 0 && <p>{tr("Sin ventas en el periodo.")}</p>}
            {data.sales30.map((r) => (
              <p key={r.currency} className="flex justify-between">
                <span>{tr("{n} ventas", { n: r.count })}</span>
                <span className="tabular-nums font-medium">{adminFmt.money(r.total, r.currency)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
