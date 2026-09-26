"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Plus } from "lucide-react";
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
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

interface BusinessRow {
  id: string;
  name: string;
  country: string;
  status: string;
  access: AccessState;
  plan: { id: string; name: string; priceMonthly: number; currency: string } | null;
  trialEndsAt: string | null;
  paidUntil: string | null;
  owners: { id: string; name: string; email: string }[];
  counts: { memberships: number; products: number; sales: number };
  createdAt: string;
}

export default function AdminBusinessesPage() {
  const tr = useText();
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const status = params.get("status") ?? "";
  const planId = params.get("planId") ?? "";
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/admin/negocios${next.size ? `?${next}` : ""}`);
  };
  const { data, error, mutate } = useSWR<BusinessRow[]>(
    withQuery("/api/admin/businesses", { search: params.get("search"), status, planId }),
    fetcher
  );
  const { data: plans } = useSWR<PlanOption[]>("/api/admin/plans", fetcher);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Negocios")}
        description={tr("Plan, estado, funciones y pagos de cada negocio")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nuevo negocio")}
          </Button>
        }
      />
      <form
        className="grid sm:grid-cols-[1fr_180px_180px] gap-3 items-end"
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
        <Select label={tr("Estado")} value={status} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">{tr("Todos")}</option>
          <option value="ACTIVE">{tr("Activo")}</option>
          <option value="TRIAL">{tr("En prueba")}</option>
          <option value="OVERDUE">{tr("Pago vencido")}</option>
          <option value="SUSPENDED">{tr("Suspendido")}</option>
        </Select>
        <Select label={tr("Plan")} value={planId} onChange={(e) => setFilter("planId", e.target.value)}>
          <option value="">{tr("Todos")}</option>
          <option value="none">{tr("Sin plan")}</option>
          {plans?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={5} />
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("No hay negocios con esos filtros.")}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm min-w-[720px]">
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
                    {tr("Vence")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">
                    {tr("Usuarios")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">
                    {tr("Productos")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium text-right">
                    {tr("Ventas")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <Link
                        href={`/admin/negocios/${b.id}`}
                        className="font-medium text-brand-700 dark:text-brand-300 hover:underline"
                      >
                        {b.name}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {b.owners.map((o) => o.email).join(", ")} · {b.country}
                      </span>
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
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {b.status === "TRIAL" && b.trialEndsAt
                        ? adminFmt.date(b.trialEndsAt)
                        : b.paidUntil
                          ? adminFmt.date(b.paidUntil)
                          : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.counts.memberships}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.counts.products}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.counts.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <div className="grid sm:grid-cols-2 gap-3">
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
          <div className="grid sm:grid-cols-2 gap-3">
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
