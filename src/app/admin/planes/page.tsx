"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import { FEATURE_GROUPS, FEATURES, NEW_FEATURE_KEYS, type FeatureKey } from "@/lib/features";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";
import { BillingSettingsCard } from "@/components/admin/BillingSettingsCard";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  trialDays: number;
  maxUsers: number | null;
  maxBranches: number | null;
  maxProducts: number | null;
  features: FeatureKey[];
  active: boolean;
  isDefault: boolean;
  isPublic: boolean;
  sortOrder: number;
  _count: { businesses: number };
}

export default function AdminPlansPage() {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Plan[]>("/api/admin/plans", fetcher);
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined);

  async function remove(plan: Plan) {
    const ok = await confirm({
      title: tr("¿Eliminar el plan {name}?", { name: plan.name }),
      confirmLabel: tr("Eliminar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      toast.success(tr("Plan eliminado"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  const limit = (n: number | null) => (n == null ? tr("Sin límite") : String(n));

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Planes y precios")}
        description={tr("Lo que paga cada negocio, sus límites y las funciones que incluye")}
        actions={
          <Button onClick={() => setEditing(null)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nuevo plan")}
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tr("Aún no hay planes. Mientras tanto, todos los negocios tienen todas las funciones.")}
        </p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-slate-900">{plan.name}</h2>
                    <p className="text-xs text-slate-500">{plan.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {plan.isDefault && <Badge tone="purple">{tr("Por defecto")}</Badge>}
                    {!plan.active && <Badge tone="gray">{tr("Inactivo")}</Badge>}
                    {plan.active && !plan.isPublic && <Badge tone="blue">{tr("Oculto")}</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-2xl font-bold text-slate-900">
                    {adminFmt.money(plan.priceMonthly, plan.currency)}
                  </span>{" "}
                  <span className="text-slate-500">/ {tr("mes")}</span>
                  {plan.priceYearly != null && (
                    <span className="block text-slate-500">
                      {tr("{price} al año", { price: adminFmt.money(plan.priceYearly, plan.currency) })}
                    </span>
                  )}
                </p>
                {plan.description && <p className="text-slate-600">{plan.description}</p>}
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-slate-500">{tr("Prueba")}</dt>
                  <dd>{tr("{n} días", { n: plan.trialDays })}</dd>
                  <dt className="text-slate-500">{tr("Usuarios")}</dt>
                  <dd>{limit(plan.maxUsers)}</dd>
                  <dt className="text-slate-500">{tr("Sucursales")}</dt>
                  <dd>{limit(plan.maxBranches)}</dd>
                  <dt className="text-slate-500">{tr("Productos")}</dt>
                  <dd>{limit(plan.maxProducts)}</dd>
                  <dt className="text-slate-500">{tr("Negocios")}</dt>
                  <dd>{plan._count.businesses}</dd>
                </dl>
                <ul className="space-y-0.5 text-xs">
                  {FEATURES.filter((f) => plan.features.includes(f.key)).map((f) => (
                    <li key={f.key} className="flex items-center gap-1.5 text-slate-700">
                      <Check className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" /> {tr(f.label)}
                    </li>
                  ))}
                  {plan.features.length === 0 && <li className="text-slate-500">{tr("Solo las funciones básicas")}</li>}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(plan)}>
                    <Pencil className="w-4 h-4" aria-hidden="true" /> {tr("Editar")}
                  </Button>
                  {plan._count.businesses === 0 && (
                    <Button size="sm" variant="secondary" onClick={() => remove(plan)}>
                      <Trash2 className="w-4 h-4" aria-hidden="true" /> {tr("Eliminar")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">
        {tr(
          "Vender, caja, inventario, clientes y fiado, compras, gastos, reportes básicos, venta sin conexión y el descuento de jubilado están en todos los planes."
        )}
      </p>
      <BillingSettingsCard />
      {editing !== undefined && (
        <PlanModal
          plan={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const str = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [form, setForm] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    priceMonthly: str(plan?.priceMonthly ?? 0),
    priceYearly: str(plan?.priceYearly),
    currency: plan?.currency ?? "USD",
    trialDays: str(plan?.trialDays ?? 14),
    maxUsers: str(plan?.maxUsers),
    maxBranches: str(plan?.maxBranches),
    maxProducts: str(plan?.maxProducts),
    features: new Set<FeatureKey>(plan?.features ?? []),
    active: plan?.active ?? true,
    isDefault: plan?.isDefault ?? false,
    isPublic: plan?.isPublic ?? true,
    sortOrder: str(plan?.sortOrder ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        priceMonthly: num(form.priceMonthly) ?? 0,
        priceYearly: num(form.priceYearly),
        currency: form.currency,
        trialDays: num(form.trialDays) ?? 0,
        maxUsers: num(form.maxUsers),
        maxBranches: num(form.maxBranches),
        maxProducts: num(form.maxProducts),
        features: [...form.features],
        active: form.active,
        isDefault: form.isDefault,
        isPublic: form.isPublic,
        sortOrder: num(form.sortOrder) ?? 0,
      };
      await api(plan ? `/api/admin/plans/${plan.id}` : "/api/admin/plans", {
        method: plan ? "PUT" : "POST",
        body,
      });
      toast.success(tr("Plan guardado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const setGroup = (keys: FeatureKey[], on: boolean) => {
    const next = new Set(form.features);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setForm({ ...form, features: next });
  };
  const toggle = (key: FeatureKey, on: boolean) => {
    const next = new Set(form.features);
    if (on) next.add(key);
    else next.delete(key);
    setForm({ ...form, features: next });
  };

  return (
    <Modal open onClose={onClose} title={plan ? tr("Editar plan") : tr("Nuevo plan")}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Nombre")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={tr("Código")}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            hint={tr("Para el enlace de registro, p. ej. pro")}
            required
          />
        </div>
        <Textarea
          label={tr("Descripción")}
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={300}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label={tr("Precio mensual")}
            inputMode="decimal"
            value={form.priceMonthly}
            onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
            required
          />
          <Input
            label={tr("Precio anual")}
            inputMode="decimal"
            value={form.priceYearly}
            onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
            hint={tr("Opcional")}
          />
          <Input
            label={tr("Moneda")}
            value={form.currency}
            maxLength={3}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            required
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input
            label={tr("Días de prueba")}
            type="number"
            min={0}
            value={form.trialDays}
            onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
          />
          <Input
            label={tr("Máx. usuarios")}
            type="number"
            min={1}
            value={form.maxUsers}
            onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
            hint={tr("Vacío = sin límite")}
          />
          <Input
            label={tr("Máx. sucursales")}
            type="number"
            min={1}
            value={form.maxBranches}
            onChange={(e) => setForm({ ...form, maxBranches: e.target.value })}
          />
          <Input
            label={tr("Máx. productos")}
            type="number"
            min={1}
            value={form.maxProducts}
            onChange={(e) => setForm({ ...form, maxProducts: e.target.value })}
          />
        </div>
        <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
          <legend className="px-1 text-sm font-medium text-slate-700">
            {tr("Funciones incluidas")} · {form.features.size}/{FEATURES.length}
          </legend>
          {FEATURE_GROUPS.map((group) => {
            const keys = FEATURES.filter((f) => f.group === group.key).map((f) => f.key);
            const all = keys.every((k) => form.features.has(k));
            return (
              <div key={group.key} role="group" aria-labelledby={`plan-grupo-${group.key}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p
                    id={`plan-grupo-${group.key}`}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {tr(group.label)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setGroup(keys, !all)}
                    className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                    aria-label={
                      all
                        ? tr("Quitar todas las de {group}", { group: tr(group.label) })
                        : tr("Incluir todas las de {group}", { group: tr(group.label) })
                    }
                  >
                    {all ? tr("Ninguna") : tr("Todas")}
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {FEATURES.filter((f) => f.group === group.key).map((f) => (
                    <Checkbox
                      key={f.key}
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          {tr(f.label)}
                          {NEW_FEATURE_KEYS.includes(f.key) && <Badge tone="purple">{tr("Nueva")}</Badge>}
                        </span>
                      }
                      checked={form.features.has(f.key)}
                      onChange={(e) => toggle(f.key, e.target.checked)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
        <div className="grid sm:grid-cols-2 gap-2">
          <Checkbox
            label={tr("Activo (se puede asignar)")}
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          <Checkbox
            label={tr("Visible en la página de precios")}
            checked={form.isPublic}
            onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
          />
          <Checkbox
            label={tr("Plan por defecto al registrarse")}
            checked={form.isDefault}
            onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
          />
          <Input
            label={tr("Orden en la página")}
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        </div>
        {plan && plan._count.businesses > 0 && (
          <p className="text-xs text-amber-700">
            {tr("Los cambios se aplican a los {n} negocio(s) con este plan.", { n: plan._count.businesses })}
          </p>
        )}
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Guardar plan")}
        </Button>
      </form>
    </Modal>
  );
}
