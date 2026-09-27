"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { CreditCard, RefreshCw } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { formatCurrency } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Select } from "@/components/ui/Input";
import { ErrorState, ListSkeleton, ScrollArea } from "@/components/ui/Misc";

type Cycle = "MONTHLY" | "YEARLY";

interface Overview {
  provider: "stripe" | "simulado" | null;
  canPay: boolean;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "OVERDUE";
  access: { blocked: boolean; reason?: string; warning?: { kind: string } | null };
  plan: { id: string; name: string; currency: string } | null;
  billingCycle: Cycle;
  trialEndsAt: string | null;
  paidUntil: string | null;
  graceUntil: string | null;
  autoRenew: boolean;
  card: string | null;
  failures: number;
  maxRetries: number;
  nextChargeAt: string | null;
  lastError: string | null;
  plans: { id: string; name: string; currency: string; monthly: number; yearly: number }[];
  payments: {
    id: string;
    createdAt: string;
    amount: number;
    currency: string;
    method: string;
    reference: string | null;
    planName: string | null;
    periodStart: string;
    periodEnd: string;
  }[];
}

/** "Mi plan": estado de la suscripción, pago en línea, renovación automática y pagos. */
export function PlanBilling({ result }: { result?: string | null }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<Overview>("/api/billing", fetcher);
  const [planId, setPlanId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);

  // Con Stripe el webhook puede tardar unos segundos: se vuelve a consultar al regresar del pago.
  useEffect(() => {
    if (result !== "ok") return;
    const timers = [2000, 5000, 10000].map((ms) => setTimeout(() => mutate(), ms));
    return () => timers.forEach(clearTimeout);
  }, [result, mutate]);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={3} />;

  const methodLabels: Record<string, string> = {
    CARD: tr("Tarjeta"),
    TRANSFER: tr("Transferencia"),
    YAPPY: "Yappy",
    CASH: tr("Efectivo"),
    OTHER: tr("Otro"),
  };
  const price = (amount: number, currency: string) => formatCurrency(amount, currency, business.locale);
  const selectedPlan = data.plans.find((p) => p.id === (planId ?? data.plan?.id)) ?? data.plans[0] ?? null;
  const selectedCycle = cycle ?? data.billingCycle;
  const amount = selectedPlan ? (selectedCycle === "YEARLY" ? selectedPlan.yearly : selectedPlan.monthly) : 0;
  const overdue = data.status === "ACTIVE" && data.paidUntil && new Date(data.paidUntil) < new Date();

  async function pay() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const { url } = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: { planId: selectedPlan.id, billingCycle: selectedCycle },
      });
      if (url.startsWith("/")) router.push(url);
      else window.location.assign(url);
    } catch (err) {
      toast.error(err);
      setPaying(false);
    }
  }

  async function toggleAutoRenew(on: boolean) {
    setSaving(true);
    // Se marca de inmediato y se confirma con el servidor (si falla, vuelve a leer el estado).
    if (data) mutate({ ...data, autoRenew: on }, { revalidate: false });
    try {
      await api("/api/billing", { method: "PATCH", body: { autoRenew: on } });
      toast.success(on ? tr("Renovación automática activada") : tr("Renovación automática cancelada"));
    } catch (err) {
      toast.error(err);
    } finally {
      mutate();
      setSaving(false);
    }
  }

  async function removeCard() {
    const ok = await confirm({
      title: tr("¿Quitar la tarjeta?"),
      message: tr("Ya no se renovará el plan automáticamente. Tendrás que pagar a mano antes del vencimiento."),
      confirmLabel: tr("Quitar tarjeta"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/billing/card", { method: "DELETE" });
      toast.success(tr("Tarjeta quitada"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  const statusBadge =
    data.status === "SUSPENDED" ? (
      <Badge tone="red">{tr("Suspendido")}</Badge>
    ) : data.status === "TRIAL" && data.access.blocked ? (
      <Badge tone="amber">{tr("Prueba vencida")}</Badge>
    ) : data.status === "TRIAL" ? (
      <Badge tone="blue">{tr("En prueba")}</Badge>
    ) : overdue ? (
      <Badge tone="amber">{tr("Pago vencido")}</Badge>
    ) : (
      <Badge tone="green">{tr("Al día")}</Badge>
    );

  return (
    <div className="space-y-4">
      {result === "ok" && (
        <p role="status" className="rounded-xl bg-brand-50 text-brand-700 dark:text-brand-300 px-4 py-3 text-sm">
          {tr("¡Gracias! Recibimos tu pago. Puede tardar unos segundos en reflejarse.")}
        </p>
      )}
      {result === "cancelado" && (
        <p role="status" className="rounded-xl bg-slate-100 text-slate-700 px-4 py-3 text-sm">
          {tr("Pago cancelado. No se hizo ningún cargo.")}
        </p>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            {tr("Tu plan")} {statusBadge}
          </h2>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">{tr("Plan")}</dt>
              <dd className="font-medium text-slate-900">{data.plan?.name ?? tr("Sin plan")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{tr("Ciclo de cobro")}</dt>
              <dd className="font-medium text-slate-900">
                {data.billingCycle === "YEARLY" ? tr("Anual") : tr("Mensual")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">
                {data.status === "TRIAL" && data.trialEndsAt ? tr("Prueba hasta") : tr("Pagado hasta")}
              </dt>
              <dd className="font-medium text-slate-900">
                {data.status === "TRIAL" && data.trialEndsAt
                  ? fmt.date(data.trialEndsAt)
                  : data.paidUntil
                    ? fmt.date(data.paidUntil)
                    : "—"}
              </dd>
            </div>
          </dl>
          {overdue && data.graceUntil && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
              {tr("Tu plan venció. Si no se paga, el negocio se suspenderá el {date}.", {
                date: fmt.date(data.graceUntil),
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> {tr("Pago automático")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-700 flex items-center gap-2">
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            {data.card ?? tr("No hay tarjeta guardada. Se guarda al pagar en línea.")}
          </p>
          {data.card && (
            <>
              <Checkbox
                label={tr("Renovar automáticamente al vencer")}
                checked={data.autoRenew}
                disabled={saving}
                onChange={(e) => toggleAutoRenew(e.target.checked)}
              />
              <Button variant="secondary" onClick={removeCard}>
                {tr("Quitar tarjeta")}
              </Button>
            </>
          )}
          {data.failures > 0 && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">
              {tr("No pudimos cobrar tu plan: {error}", { error: data.lastError ?? tr("pago rechazado") })}{" "}
              {data.nextChargeAt
                ? tr("Intento {n} de {max}; el próximo es el {date}.", {
                    n: data.failures,
                    max: data.maxRetries,
                    date: fmt.date(data.nextChargeAt),
                  })
                : tr("Ya no haremos más intentos automáticos: paga con otra tarjeta.")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Pagar en línea")}</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data.provider ? (
            <p className="text-sm text-slate-600">
              {tr(
                "El pago en línea no está configurado. Contacta al administrador para pagar por transferencia o Yappy."
              )}
            </p>
          ) : !data.canPay ? (
            <p className="text-sm text-slate-600">
              {tr("El administrador suspendió este negocio. Contacta al administrador para reactivarlo.")}
            </p>
          ) : data.plans.length === 0 ? (
            <p className="text-sm text-slate-600">{tr("No hay planes disponibles para pagar en línea.")}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label={tr("Plan")} value={selectedPlan?.id ?? ""} onChange={(e) => setPlanId(e.target.value)}>
                  {data.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label={tr("Ciclo de cobro")}
                  value={selectedCycle}
                  onChange={(e) => setCycle(e.target.value as Cycle)}
                >
                  <option value="MONTHLY">
                    {tr("Mensual")} · {selectedPlan ? price(selectedPlan.monthly, selectedPlan.currency) : ""}
                  </option>
                  <option value="YEARLY">
                    {tr("Anual")} · {selectedPlan ? price(selectedPlan.yearly, selectedPlan.currency) : ""}
                  </option>
                </Select>
              </div>
              <p className="text-xs text-slate-500">
                {tr("La tarjeta queda guardada para renovar automáticamente. Puedes cancelarlo cuando quieras.")}
                {data.provider === "simulado" && ` ${tr("Modo de prueba: no se cobra dinero real.")}`}
              </p>
              <Button onClick={pay} loading={paying} disabled={!selectedPlan}>
                <CreditCard className="w-4 h-4" aria-hidden="true" />
                {tr("Pagar {amount} con tarjeta", {
                  amount: selectedPlan ? price(amount, selectedPlan.currency) : "",
                })}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Pagos")}</h2>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("Todavía no hay pagos registrados.")}</p>
          ) : (
            <ScrollArea label={tr("Pagos")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-3 font-medium">{tr("Fecha")}</th>
                    <th className="py-2 pr-3 font-medium">{tr("Plan")}</th>
                    <th className="py-2 pr-3 font-medium">{tr("Periodo")}</th>
                    <th className="py-2 pr-3 font-medium">{tr("Forma de pago")}</th>
                    <th className="py-2 font-medium text-right">{tr("Monto")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3">{fmt.date(p.createdAt)}</td>
                      <td className="py-2 pr-3">{p.planName ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {fmt.date(p.periodStart)} – {fmt.date(p.periodEnd)}
                      </td>
                      <td className="py-2 pr-3">{methodLabels[p.method] ?? methodLabels.OTHER}</td>
                      <td className="py-2 text-right font-medium">{price(p.amount, p.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
