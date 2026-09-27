"use client";

import { useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Input } from "@/components/ui/Input";

interface Settings {
  graceDays: number;
  retryIntervalDays: number;
  maxRetries: number;
  noticeDays: number;
  suspendManualPayers: boolean;
  provider: "stripe" | "simulado" | null;
}

/** Reglas del cobro automático: reintentos, días de gracia y avisos (super admin). */
export function BillingSettingsCard() {
  const { data, mutate } = useSWR<Settings>("/api/admin/billing-settings", fetcher);
  return data ? <BillingSettingsForm initial={data} onSaved={() => mutate()} /> : null;
}

function BillingSettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);

  const num = (key: "graceDays" | "retryIntervalDays" | "maxRetries" | "noticeDays") => ({
    type: "number",
    inputMode: "numeric" as const,
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) }),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { graceDays, retryIntervalDays, maxRetries, noticeDays, suspendManualPayers } = form;
      await api("/api/admin/billing-settings", {
        method: "PUT",
        body: { graceDays, retryIntervalDays, maxRetries, noticeDays, suspendManualPayers },
      });
      toast.success(tr("Reglas de cobro guardadas"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> {tr("Cobro automático")}
        </h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-slate-600">
            {form.provider
              ? tr("Pago en línea activo con {provider}.", {
                  provider: form.provider === "stripe" ? "Stripe" : tr("el proveedor simulado"),
                })
              : tr("El pago en línea está apagado: configura BILLING_PROVIDER (stripe o simulado).")}{" "}
            {tr(
              "El cron diario avisa antes de cobrar, cobra al vencer, reintenta y suspende al pasar los días de gracia."
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input
              label={tr("Días de gracia")}
              min={0}
              max={60}
              {...num("graceDays")}
              hint={tr("Después del vencimiento")}
            />
            <Input
              label={tr("Reintentos")}
              min={1}
              max={10}
              {...num("maxRetries")}
              hint={tr("Cobros antes de rendirse")}
            />
            <Input label={tr("Días entre reintentos")} min={1} max={15} {...num("retryIntervalDays")} />
            <Input
              label={tr("Días de aviso")}
              min={1}
              max={15}
              {...num("noticeDays")}
              hint={tr("Antes de cobrar y de suspender")}
            />
          </div>
          <Checkbox
            label={tr("Suspender también a quien paga a mano (transferencia o Yappy) al pasar la gracia")}
            checked={form.suspendManualPayers}
            onChange={(e) => setForm({ ...form, suspendManualPayers: e.target.checked })}
          />
          <Button type="submit" loading={saving}>
            {tr("Guardar reglas")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
