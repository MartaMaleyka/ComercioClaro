"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ArrowLeft, CheckCircle2, LifeBuoy, Plus, RotateCcw } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import {
  FEATURE_GROUPS,
  FEATURES,
  NEW_FEATURE_KEYS,
  type AccessState,
  type FeatureKey,
  type FeatureOverrides,
} from "@/lib/features";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl, Switch } from "@/components/ui/Switch";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";
import type { PlanOption } from "@/components/admin/types";
import { ACTION_LABELS } from "@/components/admin/labels";
import { businessTypeLabel } from "@/lib/business-types";

interface Plan extends PlanOption {
  priceYearly: number | null;
  features: string[];
  maxUsers: number | null;
  maxBranches: number | null;
  maxProducts: number | null;
}

interface Detail {
  id: string;
  name: string;
  country: string;
  currency: string;
  address: string | null;
  phone: string | null;
  createdAt: string;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "PENDING" | "CLOSED";
  access: AccessState;
  businessType: string | null;
  signupSource: "SELF" | "ADMIN" | null;
  requireMfa: boolean;
  closedAt: string | null;
  closedReason: string | null;
  plan: Plan | null;
  billingCycle: "MONTHLY" | "YEARLY";
  trialEndsAt: string | null;
  paidUntil: string | null;
  suspendedReason: string | null;
  adminNotes: string | null;
  featureOverrides: FeatureOverrides;
  features: FeatureKey[];
  members: {
    id: string;
    name: string;
    email: string;
    role: string;
    disabledAt: string | null;
    emailVerifiedAt: string | null;
    lastLoginAt: string | null;
    termsAcceptedAt: string | null;
    totpEnabledAt: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    currency: string;
    method: string;
    reference: string | null;
    periodStart: string;
    periodEnd: string;
    notes: string | null;
    createdAt: string;
    plan: { name: string } | null;
  }[];
  billing: {
    autoRenew: boolean;
    card: string | null;
    failures: number;
    nextChargeAt: string | null;
    suspendedByBilling: boolean;
    failedCharges: { id: string; createdAt: string; amount: number; currency: string; error: string | null }[];
  };
  usage: { users: number; products: number; branches: number };
  sales30: { count: number; total: number };
  lastSaleAt: string | null;
  audit: { id: string; action: string; createdAt: string; userId: string; userName: string | null; details: unknown }[];
}

const METHODS: Record<string, string> = {
  TRANSFER: "Transferencia",
  YAPPY: "Yappy",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

export default function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tr = useText();
  const toast = useToast();
  const router = useRouter();
  const { data, error, mutate } = useSWR<Detail>(`/api/admin/businesses/${id}`, fetcher);
  const { data: plans } = useSWR<Plan[]>("/api/admin/plans", fetcher);
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [acting, setActing] = useState(false);
  const [savingMfa, setSavingMfa] = useState(false);
  const confirm = useConfirm();

  async function toggleMfa(on: boolean) {
    setSavingMfa(true);
    try {
      await api(`/api/admin/businesses/${id}`, { method: "PATCH", body: { requireMfa: on } });
      toast.success(
        on
          ? tr("Los usuarios de este negocio deberán usar la verificación en dos pasos")
          : tr("La verificación en dos pasos vuelve a ser opcional en este negocio")
      );
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSavingMfa(false);
    }
  }

  async function enterSupport() {
    try {
      await api(`/api/admin/businesses/${id}/support`, { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err);
    }
  }

  async function approve() {
    setActing(true);
    try {
      await api(`/api/admin/businesses/${id}/approve`, { method: "POST" });
      toast.success(tr("Negocio aprobado: avisamos al dueño"));
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setActing(false);
    }
  }

  async function reopen() {
    const ok = await confirm({
      title: tr("¿Reactivar {name}?", { name: data!.name }),
      message: tr("El negocio vuelve a funcionar con su plan y se avisa al dueño."),
      confirmLabel: tr("Reactivar"),
    });
    if (!ok) return;
    setActing(true);
    try {
      await api(`/api/admin/businesses/${id}/reopen`, { method: "POST" });
      toast.success(tr("Negocio reactivado"));
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setActing(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={5} />;

  return (
    <div className="space-y-5">
      <Link href="/admin/negocios" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {tr("Negocios")}
      </Link>
      <PageHeader
        title={data.name}
        description={[
          data.country,
          data.businessType ? tr(businessTypeLabel(data.businessType) ?? data.businessType) : null,
          data.signupSource === "SELF"
            ? tr("Registro propio")
            : data.signupSource === "ADMIN"
              ? tr("Alta del admin")
              : null,
          tr("Creado el {date}", { date: adminFmt.date(data.createdAt) }),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {data.status === "PENDING" && (
              <Button onClick={approve} loading={acting}>
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {tr("Aprobar")}
              </Button>
            )}
            {data.status === "CLOSED" ? (
              <Button onClick={reopen} loading={acting}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> {tr("Reactivar")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setClosing(true)}>
                <Archive className="w-4 h-4" aria-hidden="true" />
                {data.status === "PENDING" ? tr("Rechazar") : tr("Dar de baja")}
              </Button>
            )}
            <Button variant="secondary" onClick={enterSupport}>
              <LifeBuoy className="w-4 h-4" aria-hidden="true" /> {tr("Entrar como soporte")}
            </Button>
          </>
        }
      />
      {data.status === "PENDING" && (
        <p role="status" className="rounded-xl bg-purple-50 text-purple-700 text-sm px-4 py-3">
          {tr("Este registro espera tu aprobación. Al aprobarlo empieza su prueba y se avisa al dueño por correo.")}
        </p>
      )}
      {data.status === "CLOSED" && (
        <p role="status" className="rounded-xl bg-slate-100 text-slate-700 text-sm px-4 py-3">
          {tr("Dado de baja el {date}. Motivo: {reason}. Los datos se conservan; al reactivarlo todo sigue ahí.", {
            date: data.closedAt ? adminFmt.date(data.closedAt) : "—",
            reason: data.closedReason ?? "—",
          })}
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <StatusBadge status={data.status} access={data.access} />
        {data.plan && <Badge tone="purple">{data.plan.name}</Badge>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SubscriptionCard
          key={`sub-${data.status}-${data.plan?.id}-${data.paidUntil}`}
          detail={data}
          plans={plans ?? []}
          onSaved={mutate}
        />
        <div className="space-y-4">
          <UsageCard detail={data} />
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{tr("Pagos")}</h2>
                <Button size="sm" onClick={() => setPaying(true)}>
                  <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Registrar pago")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm rounded-xl bg-slate-50 px-3 py-2 space-y-1">
                <p>
                  {data.billing.card
                    ? tr("Tarjeta: {card}", { card: data.billing.card })
                    : tr("Sin tarjeta guardada (paga a mano)")}
                  {" · "}
                  {data.billing.autoRenew ? tr("Renovación automática") : tr("Sin renovación automática")}
                </p>
                {data.billing.failures > 0 && (
                  <p className="text-red-700">
                    {tr("{n} cobro(s) fallido(s)", { n: data.billing.failures })}
                    {data.billing.nextChargeAt &&
                      ` · ${tr("Próximo intento: {date}", { date: adminFmt.date(data.billing.nextChargeAt) })}`}
                  </p>
                )}
                {data.billing.failedCharges.map((c) => (
                  <p key={c.id} className="text-xs text-slate-500">
                    {adminFmt.date(c.createdAt)} · {adminFmt.money(c.amount, c.currency)} · {c.error}
                  </p>
                ))}
                {data.billing.suspendedByBilling && (
                  <p className="text-xs text-slate-600">
                    {tr("Suspendido por falta de pago: se reactiva al pagar en línea.")}
                  </p>
                )}
              </div>
              {data.payments.length === 0 ? (
                <p className="text-sm text-slate-500">{tr("Sin pagos registrados.")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.payments.map((p) => (
                    <li key={p.id} className="py-2 flex justify-between gap-3">
                      <span>
                        <span className="font-medium">{adminFmt.money(p.amount, p.currency)}</span> ·{" "}
                        {tr(METHODS[p.method] ?? p.method)}
                        {p.reference && ` · ${p.reference}`}
                        <span className="block text-xs text-slate-500">
                          {tr("Cubre del {from} al {to}", {
                            from: adminFmt.date(p.periodStart),
                            to: adminFmt.date(p.periodEnd),
                          })}
                          {p.plan && ` · ${p.plan.name}`}
                        </span>
                      </span>
                      <span className="text-xs text-slate-500 shrink-0">{adminFmt.date(p.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FeaturesCard key={`features-${data.plan?.id}`} detail={data} onSaved={mutate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Usuarios del negocio")}</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm">
                <span className="font-medium text-slate-900">{tr("Exigir verificación en dos pasos")}</span>
                <span className="block text-xs text-slate-500">
                  {tr("Quien no la tenga deberá activarla al entrar. {n} de {total} ya la usan.", {
                    n: data.members.filter((m) => m.totpEnabledAt).length,
                    total: data.members.length,
                  })}
                </span>
              </span>
              <Switch
                checked={data.requireMfa}
                onChange={toggleMfa}
                busy={savingMfa}
                label={tr("Exigir verificación en dos pasos")}
              />
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {data.members.map((m) => (
                <li key={m.id} className="py-2 flex justify-between gap-2">
                  <span>
                    {m.name}
                    <span className="block text-xs text-slate-500">{m.email}</span>
                    <span className="block text-xs text-slate-500">
                      {m.lastLoginAt
                        ? tr("Último acceso: {date}", { date: adminFmt.dateTime(m.lastLoginAt) })
                        : tr("Sin accesos registrados")}
                      {m.termsAcceptedAt &&
                        ` · ${tr("Aceptó términos el {date}", { date: adminFmt.date(m.termsAcceptedAt) })}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1 items-start justify-end">
                    <Badge>{m.role === "OWNER" ? tr("Dueño") : tr("Cajero")}</Badge>
                    {m.totpEnabledAt && <Badge tone="green">{tr("Dos pasos")}</Badge>}
                    {m.emailVerifiedAt ? (
                      <Badge tone="green">{tr("Correo confirmado")}</Badge>
                    ) : (
                      <Badge tone="amber">{tr("Correo sin confirmar")}</Badge>
                    )}
                    {m.disabledAt && <Badge tone="red">{tr("Bloqueado")}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Historial de administración")}</h2>
          </CardHeader>
          <CardContent>
            {data.audit.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("Sin cambios registrados.")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.audit.map((a) => (
                  <li key={a.id} className="py-2 flex justify-between gap-2">
                    <span>
                      {tr(ACTION_LABELS[a.action] ?? a.action)}
                      <span className="block text-xs text-slate-500">
                        {a.userName ?? (a.userId === "billing" ? tr("Cobro automático") : null)}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">{adminFmt.dateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {closing && (
        <CloseBusinessModal
          detail={data}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false);
            mutate();
          }}
        />
      )}
      {paying && (
        <PaymentModal
          detail={data}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function SubscriptionCard({ detail, plans, onSaved }: { detail: Detail; plans: Plan[]; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const lifecycleLocked = detail.status === "PENDING" || detail.status === "CLOSED";
  const [form, setForm] = useState({
    planId: detail.plan?.id ?? "",
    billingCycle: detail.billingCycle,
    status: detail.status,
    trialEndsAt: adminFmt.dayInput(detail.trialEndsAt),
    paidUntil: adminFmt.dayInput(detail.paidUntil),
    suspendedReason: detail.suspendedReason ?? "",
    adminNotes: detail.adminNotes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.status === "SUSPENDED" && detail.status !== "SUSPENDED") {
      const ok = await confirm({
        title: tr("¿Suspender {name}?", { name: detail.name }),
        message: tr("Sus usuarios no podrán vender ni ver sus datos hasta que lo reactives. No se borra nada."),
        confirmLabel: tr("Suspender"),
        danger: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await api(`/api/admin/businesses/${detail.id}`, {
        method: "PATCH",
        body: {
          planId: form.planId || null,
          billingCycle: form.billingCycle,
          // Pendiente o dado de baja se cambian con Aprobar / Reactivar, no aquí.
          status: lifecycleLocked ? undefined : form.status,
          trialEndsAt: adminFmt.endOfDay(form.trialEndsAt),
          paidUntil: adminFmt.endOfDay(form.paidUntil),
          suspendedReason: form.suspendedReason || null,
          adminNotes: form.adminNotes || null,
        },
      });
      toast.success(tr("Cambios guardados"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const plan = plans.find((p) => p.id === form.planId);
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Suscripción")}</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={tr("Plan")}
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
            >
              <option value="">{tr("Sin plan (todas las funciones)")}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.active && p.id !== detail.plan?.id}>
                  {p.name} · {adminFmt.money(p.priceMonthly, p.currency)}
                  {!p.active ? ` (${tr("inactivo")})` : ""}
                </option>
              ))}
            </Select>
            <Select
              label={tr("Ciclo de cobro")}
              value={form.billingCycle}
              onChange={(e) => setForm({ ...form, billingCycle: e.target.value as Detail["billingCycle"] })}
              hint={
                plan
                  ? form.billingCycle === "YEARLY" && plan.priceYearly
                    ? tr("{price} al año", { price: adminFmt.money(plan.priceYearly, plan.currency) })
                    : tr("{price} al mes", { price: adminFmt.money(plan.priceMonthly, plan.currency) })
                  : undefined
              }
            >
              <option value="MONTHLY">{tr("Mensual")}</option>
              <option value="YEARLY">{tr("Anual")}</option>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={tr("Estado")}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Detail["status"] })}
              disabled={lifecycleLocked}
              hint={lifecycleLocked ? tr("Usa Aprobar o Reactivar arriba para cambiarlo.") : undefined}
            >
              {detail.status === "PENDING" && <option value="PENDING">{tr("Por aprobar")}</option>}
              {detail.status === "CLOSED" && <option value="CLOSED">{tr("Dado de baja")}</option>}
              <option value="ACTIVE">{tr("Activo")}</option>
              <option value="TRIAL">{tr("En prueba")}</option>
              <option value="SUSPENDED">{tr("Suspendido")}</option>
            </Select>
            {form.status === "TRIAL" ? (
              <Input
                label={tr("La prueba termina")}
                type="date"
                value={form.trialEndsAt}
                onChange={(e) => setForm({ ...form, trialEndsAt: e.target.value })}
                required
              />
            ) : (
              <Input
                label={tr("Pagado hasta")}
                type="date"
                value={form.paidUntil}
                onChange={(e) => setForm({ ...form, paidUntil: e.target.value })}
                hint={tr("Vacío: sin fecha de vencimiento")}
              />
            )}
          </div>
          {form.status === "SUSPENDED" && (
            <Input
              label={tr("Motivo de la suspensión")}
              value={form.suspendedReason}
              onChange={(e) => setForm({ ...form, suspendedReason: e.target.value })}
              hint={tr("Lo ven los usuarios del negocio.")}
              required
              maxLength={300}
            />
          )}
          <Textarea
            label={tr("Notas internas")}
            rows={3}
            value={form.adminNotes}
            onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
            hint={tr("Solo las ve el administrador.")}
            maxLength={2000}
          />
          <Button type="submit" loading={saving}>
            {tr("Guardar suscripción")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function UsageCard({ detail }: { detail: Detail }) {
  const tr = useText();
  const plan = detail.plan;
  const row = (label: string, used: number, max: number | null | undefined) => (
    <div className="flex justify-between text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className={max != null && used >= max ? "font-semibold text-amber-700 tabular-nums" : "tabular-nums"}>
        {max != null ? tr("{used} de {max}", { used, max }) : tr("{used} (sin límite)", { used })}
      </dd>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Uso y límites")}</h2>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1.5">
          {row(tr("Usuarios"), detail.usage.users, plan?.maxUsers)}
          {row(tr("Sucursales del dueño"), detail.usage.branches, plan?.maxBranches)}
          {row(tr("Productos activos"), detail.usage.products, plan?.maxProducts)}
          <div className="flex justify-between text-sm">
            <dt className="text-slate-600">{tr("Ventas en 30 días")}</dt>
            <dd className="tabular-nums">
              {detail.sales30.count} · {adminFmt.money(detail.sales30.total, detail.currency)}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-slate-600">{tr("Última venta")}</dt>
            <dd>{detail.lastSaleAt ? adminFmt.dateTime(detail.lastSaleAt) : "—"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

type OverrideChoice = "plan" | "on" | "off";

/** Funciones del negocio: las del plan, o activadas/desactivadas a mano para este negocio. */
function FeaturesCard({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const [overrides, setOverrides] = useState(detail.featureOverrides);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<FeatureKey | null>(null);
  const inPlan = (key: FeatureKey) => (detail.plan ? detail.plan.features.includes(key) : true);
  const modeOf = (key: FeatureKey): OverrideChoice =>
    overrides[key] === undefined ? "plan" : overrides[key] ? "on" : "off";
  const isActive = (key: FeatureKey) => (overrides[key] === undefined ? inPlan(key) : overrides[key]!);
  const activeCount = FEATURES.filter((f) => isActive(f.key)).length;
  const manual = Object.keys(overrides).length;
  const q = query.trim().toLocaleLowerCase("es");
  const visible = FEATURES.filter((f) => !q || `${tr(f.label)} ${f.label}`.toLocaleLowerCase("es").includes(q));

  // Cada cambio se guarda al momento: no hay que acordarse de un botón Guardar.
  async function change(key: FeatureKey, mode: OverrideChoice) {
    const previous = overrides;
    const next = { ...overrides };
    if (mode === "plan") delete next[key];
    else next[key] = mode === "on";
    setOverrides(next);
    setSaving(key);
    try {
      await api(`/api/admin/businesses/${detail.id}/features`, { method: "PUT", body: { feature: key, mode } });
      const label = tr(FEATURES.find((f) => f.key === key)!.label);
      const on = mode === "plan" ? inPlan(key) : mode === "on";
      toast.success(on ? tr("{feature} activa", { feature: label }) : tr("{feature} apagada", { feature: label }));
      onSaved();
    } catch (err) {
      setOverrides(previous);
      toast.error(err);
    } finally {
      setSaving(null);
    }
  }

  async function resetAll() {
    const ok = await confirm({
      title: tr("¿Volver todo a lo que dice el plan?"),
      message: tr("Se quitan los {n} ajuste(s) a mano de este negocio.", { n: manual }),
      confirmLabel: tr("Volver al plan"),
    });
    if (!ok) return;
    try {
      await api(`/api/admin/businesses/${detail.id}`, { method: "PATCH", body: { featureOverrides: {} } });
      setOverrides({});
      toast.success(tr("Funciones según el plan"));
      onSaved();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">{tr("Funciones")}</h2>
            <p className="text-sm text-slate-500">
              {tr(
                "Por defecto el negocio tiene las funciones de su plan. Cambia una solo para este negocio con Sí o No; se guarda al momento."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="green">{tr("{n} de {total} activas", { n: activeCount, total: FEATURES.length })}</Badge>
            {manual > 0 && <Badge tone="amber">{tr("{n} ajuste(s) a mano", { n: manual })}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full sm:w-72">
            <Input
              label={tr("Buscar función")}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {manual > 0 && (
            <Button variant="secondary" size="sm" onClick={resetAll}>
              {tr("Volver todo al plan")}
            </Button>
          )}
        </div>
        {FEATURE_GROUPS.map((group) => {
          const rows = visible.filter((f) => f.group === group.key);
          if (rows.length === 0) return null;
          return (
            <section key={group.key} aria-labelledby={`funciones-${group.key}`}>
              <h3
                id={`funciones-${group.key}`}
                className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"
              >
                {tr(group.label)}
              </h3>
              <ul className="divide-y divide-slate-100">
                {rows.map((f) => {
                  const mode = modeOf(f.key);
                  const on = isActive(f.key);
                  return (
                    <li key={f.key} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={on ? "w-2 h-2 rounded-full bg-brand-600" : "w-2 h-2 rounded-full bg-slate-400"}
                          />
                          {tr(f.label)}
                          {NEW_FEATURE_KEYS.includes(f.key) && <Badge tone="purple">{tr("Nueva")}</Badge>}
                          <span className="sr-only">{on ? tr("Activa") : tr("Inactiva")}</span>
                        </p>
                        <p className="text-xs text-slate-500">{tr(f.description)}</p>
                      </div>
                      <SegmentedControl<OverrideChoice>
                        label={tr("Función {name}", { name: tr(f.label) })}
                        value={mode}
                        disabled={saving === f.key}
                        onChange={(m) => change(f.key, m)}
                        options={[
                          {
                            value: "plan",
                            label: inPlan(f.key) ? tr("Plan (sí)") : tr("Plan (no)"),
                            title: inPlan(f.key) ? tr("Según el plan (sí)") : tr("Según el plan (no)"),
                          },
                          { value: "on", label: tr("Sí"), title: tr("Activada solo para este negocio") },
                          { value: "off", label: tr("No"), title: tr("Desactivada solo para este negocio") },
                        ]}
                        tone={(v) =>
                          v !== mode
                            ? "text-slate-600"
                            : v === "on"
                              ? "bg-brand-600 text-white shadow-sm"
                              : v === "off"
                                ? "bg-slate-700 text-white shadow-sm"
                                : "bg-surface text-slate-900 shadow-sm"
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">{tr("Ninguna función coincide con la búsqueda.")}</p>
        )}
        <p className="text-xs text-slate-500">
          <Link href="/admin/planes?vista=funciones" className="text-brand-700 dark:text-brand-300 underline">
            {tr("Ver qué incluye cada plan")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

function PaymentModal({ detail, onClose, onSaved }: { detail: Detail; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const yearly = detail.billingCycle === "YEARLY";
  const plan = detail.plan;
  const suggested = plan ? (yearly && plan.priceYearly ? plan.priceYearly : plan.priceMonthly) : 0;
  const [form, setForm] = useState({
    amount: String(suggested),
    months: yearly ? "12" : "1",
    method: "TRANSFER",
    reference: "",
    notes: "",
    reactivate: true,
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/businesses/${detail.id}/payments`, {
        body: {
          amount: Number(form.amount.replace(",", ".")) || 0,
          months: Number(form.months) || 1,
          method: form.method,
          reference: form.reference || null,
          notes: form.notes || null,
          reactivate: form.reactivate,
        },
      });
      toast.success(tr("Pago registrado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Registrar pago")}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-600">
          {tr("La vigencia se extiende desde el vencimiento actual (o desde hoy si ya venció).")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <Input
            label={tr("Meses que cubre")}
            type="number"
            min={1}
            max={36}
            value={form.months}
            onChange={(e) => setForm({ ...form, months: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={tr("Forma de pago")}
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
          >
            {Object.entries(METHODS).map(([value, label]) => (
              <option key={value} value={value}>
                {tr(label)}
              </option>
            ))}
          </Select>
          <Input
            label={tr("Referencia")}
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            maxLength={80}
          />
        </div>
        <Input
          label={tr("Notas")}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          maxLength={300}
        />
        {detail.status === "SUSPENDED" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="w-5 h-5 accent-brand-600"
              checked={form.reactivate}
              onChange={(e) => setForm({ ...form, reactivate: e.target.checked })}
            />
            {tr("Reactivar el negocio al registrar el pago")}
          </label>
        )}
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Registrar pago")}
        </Button>
      </form>
    </Modal>
  );
}

/** Dar de baja (o rechazar un registro): motivo obligatorio y aviso opcional al dueño. */
function CloseBusinessModal({
  detail,
  onClose,
  onClosed,
}: {
  detail: Detail;
  onClose: () => void;
  onClosed: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const rejecting = detail.status === "PENDING";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/businesses/${detail.id}/close`, { method: "POST", body: { reason, notify } });
      toast.success(rejecting ? tr("Registro rechazado") : tr("Negocio dado de baja"));
      onClosed();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rejecting ? tr("Rechazar {name}", { name: detail.name }) : tr("Dar de baja {name}", { name: detail.name })}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {tr(
            "Nadie podrá usar el negocio y se detiene el cobro automático. Los datos se conservan y puedes reactivarlo cuando quieras."
          )}
        </p>
        <Textarea
          label={tr("Motivo")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={300}
          rows={3}
          placeholder={
            rejecting ? tr("Datos incompletos, registro duplicado…") : tr("Lo pidió el dueño, cierre del local…")
          }
        />
        <Checkbox
          label={tr("Avisar al dueño por correo")}
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button type="submit" variant="danger" loading={saving} disabled={!reason.trim()}>
            {rejecting ? tr("Rechazar registro") : tr("Dar de baja")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
