"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Download, MailCheck, MailWarning, Plus } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import type { AccessState } from "@/lib/features";
import { useToast } from "@/components/providers/ToastProvider";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { PlanOption } from "@/components/admin/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader, ScrollArea } from "@/components/ui/Misc";
import { Switch } from "@/components/ui/Switch";
import { BUSINESS_TYPES, businessTypeLabel } from "@/lib/business-types";

interface BusinessRow {
  id: string;
  name: string;
  country: string;
  status: string;
  access: AccessState;
  plan: { id: string; name: string; priceMonthly: number; currency: string } | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
  businessType: string | null;
  signupSource: "SELF" | "ADMIN" | null;
  closedReason: string | null;
  owners: { id: string; name: string; email: string; emailVerified: boolean }[];
  lastLoginAt: string | null;
  lastSaleAt: string | null;
  counts: { memberships: number; products: number; sales: number };
  createdAt: string;
}

const FILTERS = ["search", "status", "planId", "country", "businessType", "source", "from", "to"] as const;

export default function AdminBusinessesPage() {
  const tr = useText();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const value = (key: (typeof FILTERS)[number]) => params.get(key) ?? "";
  const setFilter = (key: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    router.replace(`/admin/negocios${next.size ? `?${next}` : ""}`);
  };
  const query = Object.fromEntries(FILTERS.map((k) => [k, params.get(k)]));
  const activeFilters = FILTERS.filter((k) => k !== "search" && params.get(k)).length;
  const { data, error, mutate } = useSWR<BusinessRow[]>(withQuery("/api/admin/businesses", query), fetcher);
  const { data: plans } = useSWR<PlanOption[]>("/api/admin/plans", fetcher);
  const { data: signup, mutate: mutateSignup } = useSWR<{ requireSignupApproval: boolean }>(
    "/api/admin/signup-settings",
    fetcher
  );
  const { data: pending, mutate: mutatePending } = useSWR<BusinessRow[]>(
    "/api/admin/businesses?status=PENDING",
    fetcher
  );
  const [creating, setCreating] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  async function toggleApproval(enabled: boolean) {
    setSavingApproval(true);
    mutateSignup({ requireSignupApproval: enabled }, { revalidate: false });
    try {
      await api("/api/admin/signup-settings", { method: "PUT", body: { enabled } });
      toast.success(
        enabled
          ? tr("Los registros nuevos esperarán tu aprobación")
          : tr("Los registros nuevos entran directo a su prueba")
      );
    } catch (err) {
      toast.error(err);
    } finally {
      setSavingApproval(false);
      mutateSignup();
    }
  }

  async function approve(b: BusinessRow) {
    setApproving(b.id);
    try {
      await api(`/api/admin/businesses/${b.id}/approve`, { method: "POST" });
      toast.success(tr("{name} aprobado: avisamos al dueño", { name: b.name }));
      mutate();
      mutatePending();
    } catch (err) {
      toast.error(err);
    } finally {
      setApproving(null);
    }
  }

  const exportHref = withQuery("/api/admin/businesses/export", query);
  const pendingCount = pending?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Negocios")}
        description={tr("Registros, plan, estado, funciones y pagos de cada negocio")}
        actions={
          <>
            <a
              href={exportHref}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> {tr("Exportar CSV")}
            </a>
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nuevo negocio")}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{tr("Aprobar a mano los registros nuevos")}</p>
            <p className="text-xs text-slate-500">
              {signup?.requireSignupApproval
                ? tr("Quien se registra espera tu aprobación antes de usar la app. Te avisamos por correo.")
                : tr("Quien se registra empieza su prueba al momento. Te avisamos por correo de cada registro.")}
            </p>
          </div>
          <Switch
            checked={signup?.requireSignupApproval ?? false}
            onChange={toggleApproval}
            busy={savingApproval || !signup}
            label={tr("Aprobar a mano los registros nuevos")}
          />
        </CardContent>
      </Card>

      {pendingCount > 0 && value("status") !== "PENDING" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-purple-50 px-4 py-3"
        >
          <p className="text-sm text-purple-700">{tr("{n} registro(s) esperan tu aprobación.", { n: pendingCount })}</p>
          <Button size="sm" variant="secondary" onClick={() => setFilter("status", "PENDING")}>
            {tr("Ver por aprobar")}
          </Button>
        </div>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter("search", search.trim());
        }}
      >
        <Input
          label={tr("Buscar por negocio, dueño o correo")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setFilter("search", search.trim())}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <Select label={tr("Estado")} value={value("status")} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">{tr("Todos")}</option>
            <option value="ACTIVE">{tr("Activo")}</option>
            <option value="TRIAL">{tr("En prueba")}</option>
            <option value="OVERDUE">{tr("Pago vencido")}</option>
            <option value="SUSPENDED">{tr("Suspendido")}</option>
            <option value="PENDING">{tr("Por aprobar")}</option>
            <option value="CLOSED">{tr("Dado de baja")}</option>
          </Select>
          <Select label={tr("Plan")} value={value("planId")} onChange={(e) => setFilter("planId", e.target.value)}>
            <option value="">{tr("Todos")}</option>
            <option value="none">{tr("Sin plan")}</option>
            {plans?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select label={tr("País")} value={value("country")} onChange={(e) => setFilter("country", e.target.value)}>
            <option value="">{tr("Todos")}</option>
            <option value="PA">Panamá</option>
            <option value="MX">México</option>
            <option value="OTHER">{tr("Otro")}</option>
          </Select>
          <Select
            label={tr("Tipo")}
            value={value("businessType")}
            onChange={(e) => setFilter("businessType", e.target.value)}
          >
            <option value="">{tr("Todos")}</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {tr(t.label)}
              </option>
            ))}
          </Select>
          <Select label={tr("Origen")} value={value("source")} onChange={(e) => setFilter("source", e.target.value)}>
            <option value="">{tr("Todos")}</option>
            <option value="SELF">{tr("Registro propio")}</option>
            <option value="ADMIN">{tr("Alta del admin")}</option>
          </Select>
          <Input
            label={tr("Registrado desde")}
            type="date"
            value={value("from")}
            onChange={(e) => setFilter("from", e.target.value)}
          />
          <Input
            label={tr("Hasta")}
            type="date"
            value={value("to")}
            onChange={(e) => setFilter("to", e.target.value)}
          />
          {activeFilters > 0 && (
            <Button type="button" variant="ghost" onClick={() => router.replace("/admin/negocios")}>
              {tr("Quitar filtros ({n})", { n: activeFilters })}
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={5} />
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("No hay negocios con esos filtros.")}</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <p className="px-4 pt-3 text-xs text-slate-500">{tr("{n} negocio(s)", { n: data.length })}</p>
            <ScrollArea label={tr("Negocios")}>
              <table className="w-full text-sm min-w-[900px]">
                <caption className="sr-only">{tr("Negocios")}</caption>
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Negocio")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Plan")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Estado")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Registro")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Actividad")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {tr("Vence")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium text-right">
                      {tr("Ventas")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map((b) => {
                    const owner = b.owners[0];
                    return (
                      <tr key={b.id} className="align-top">
                        <th scope="row" className="px-4 py-2.5 text-left font-normal">
                          <Link
                            href={`/admin/negocios/${b.id}`}
                            className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                          >
                            {b.name}
                          </Link>
                          <span className="block text-xs text-slate-500">
                            {[b.businessType ? tr(businessTypeLabel(b.businessType) ?? "") : null, b.country]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {owner && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              {owner.email}
                              {owner.emailVerified ? (
                                <MailCheck className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
                              ) : (
                                <MailWarning className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                              )}
                              <span className="sr-only">
                                {owner.emailVerified ? tr("Correo confirmado") : tr("Correo sin confirmar")}
                              </span>
                            </span>
                          )}
                        </th>
                        <td className="px-4 py-2.5">
                          {b.plan ? (
                            <>
                              {b.plan.name}
                              <span className="block text-xs text-slate-500">
                                {adminFmt.money(b.plan.priceMonthly, b.plan.currency)} / {tr("mes")}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-500">{tr("Sin plan")}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={b.status} access={b.access} />
                          {b.status === "PENDING" && (
                            <Button
                              size="sm"
                              className="mt-1.5"
                              onClick={() => approve(b)}
                              loading={approving === b.id}
                              aria-label={tr("Aprobar {name}", { name: b.name })}
                            >
                              {tr("Aprobar")}
                            </Button>
                          )}
                          {b.status === "CLOSED" && b.closedReason && (
                            <span className="block text-xs text-slate-500 mt-1 max-w-48">{b.closedReason}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {adminFmt.date(b.createdAt)}
                          <span className="block text-xs text-slate-500">
                            {b.signupSource === "SELF"
                              ? tr("Registro propio")
                              : b.signupSource === "ADMIN"
                                ? tr("Alta del admin")
                                : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 text-xs">
                          <span className="block">
                            {b.lastLoginAt
                              ? tr("Entró: {date}", { date: adminFmt.date(b.lastLoginAt) })
                              : tr("Sin accesos registrados")}
                          </span>
                          <span className="block text-slate-500">
                            {b.lastSaleAt
                              ? tr("Vendió: {date}", { date: adminFmt.date(b.lastSaleAt) })
                              : tr("Sin ventas")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {b.status === "TRIAL" && b.trialEndsAt
                            ? adminFmt.date(b.trialEndsAt)
                            : b.paidUntil
                              ? adminFmt.date(b.paidUntil)
                              : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {b.counts.sales}
                          <span className="block text-xs text-slate-500">
                            {tr("{n} usuario(s)", { n: b.counts.memberships })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {creating && (
        <NewBusinessModal
          plans={plans ?? []}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/admin/negocios/${id}`)}
        />
      )}
    </div>
  );
}

function NewBusinessModal({
  plans,
  onClose,
  onCreated,
}: {
  plans: PlanOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const tr = useText();
  const toast = useToast();
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", country: "PA", planId: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ id: string; tempPassword: string | null; email: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ business: { id: string }; tempPassword: string | null }>("/api/admin/businesses", {
        body: { ...form, planId: form.planId || null },
      });
      toast.success(tr("Negocio creado"));
      setResult({ id: res.business.id, tempPassword: res.tempPassword, email: form.email });
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={result ? () => onCreated(result.id) : onClose} title={tr("Nuevo negocio")}>
      {result ? (
        <div className="space-y-3 text-sm">
          {result.tempPassword ? (
            <>
              <p>
                {tr("Entrega al dueño estos datos. La contraseña se muestra una sola vez y debe cambiarla al entrar.")}
              </p>
              <p className="rounded-xl bg-slate-50 p-3 font-mono">
                {result.email}
                <br />
                {result.tempPassword}
              </p>
            </>
          ) : (
            <p>{tr("El correo ya tenía cuenta: el negocio quedó agregado a ese usuario.")}</p>
          )}
          <Button className="w-full" onClick={() => onCreated(result.id)}>
            {tr("Ver el negocio")}
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <Input
            label={tr("Nombre del negocio")}
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={tr("Nombre del dueño")}
              value={form.ownerName}
              onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              required
            />
            <Input
              label={tr("Correo del dueño")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={tr("País")}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            >
              <option value="PA">Panamá</option>
              <option value="MX">México</option>
              <option value="OTHER">{tr("Otro")}</option>
            </Select>
            <Select
              label={tr("Plan")}
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
            >
              <option value="">{tr("Sin plan (todas las funciones)")}</option>
              {plans
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {adminFmt.money(p.priceMonthly, p.currency)}
                  </option>
                ))}
            </Select>
          </div>
          <Button type="submit" className="w-full" loading={saving}>
            {tr("Crear negocio")}
          </Button>
        </form>
      )}
    </Modal>
  );
}
