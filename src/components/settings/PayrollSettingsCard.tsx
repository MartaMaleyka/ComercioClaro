"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Settings = Record<string, number>;

/** Campos en porcentaje (se guardan como fracción) y en monto o número. */
const PERCENT = [
  ["cssEmployee", "CSS del empleado"],
  ["cssEmployer", "CSS del patrono"],
  ["eduEmployee", "Seguro educativo del empleado"],
  ["eduEmployer", "Seguro educativo del patrono"],
  ["riskEmployer", "Riesgos profesionales (patrono)"],
  ["thirteenthCssEmployee", "CSS del empleado sobre el décimo"],
  ["thirteenthCssEmployer", "CSS del patrono sobre el décimo"],
  ["isrMiddleRate", "ISR del tramo intermedio"],
  ["isrTopRate", "ISR del tramo alto"],
] as const;
const PLAIN = [
  ["isrExempt", "ISR: exento hasta (anual)"],
  ["isrMiddleLimit", "ISR: tramo intermedio hasta (anual)"],
  ["overtimeFactor", "Factor de hora extra (1.25 = 25% de recargo)"],
  ["monthlyHours", "Horas al mes para el valor de la hora"],
] as const;

const round = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d);

/** Parámetros de la planilla de Panamá: valores por defecto editables. */
export function PayrollSettingsCard() {
  const { data } = useSWR<{ settings: Settings; defaults: Settings }>("/api/payroll/settings", fetcher);
  return data ? <Editor initial={data.settings} defaults={data.defaults} /> : null;
}

function Editor({ initial, defaults }: { initial: Settings; defaults: Settings }) {
  const tr = useText();
  const toast = useToast();
  const toForm = (s: Settings) =>
    Object.fromEntries([
      ...PERCENT.map(([k]) => [k, round(s[k] * 100, 4)]),
      ...PLAIN.map(([k]) => [k, String(s[k])]),
    ]) as Record<string, string>;
  const [form, setForm] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = Object.fromEntries([
        ...PERCENT.map(([k]) => [k, Number(form[k].replace(",", ".")) / 100]),
        ...PLAIN.map(([k]) => [k, Number(form[k].replace(",", "."))]),
      ]);
      await api("/api/payroll/settings", { method: "PUT", body });
      toast.success(tr("Parámetros de planilla guardados"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Planilla")}</h2>
        <p className="text-sm text-amber-800">
          {tr("Valores por defecto para Panamá. Verifícalos con tu contador: cambian con las reformas a la CSS.")}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PERCENT.map(([key, label]) => (
              <Input
                key={key}
                label={`${tr(label)} (%)`}
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            ))}
            {PLAIN.map(([key, label]) => (
              <Input
                key={key}
                label={tr(label)}
                inputMode="decimal"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button type="submit" loading={saving}>
              {tr("Guardar")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setForm(toForm(defaults))}>
              {tr("Restaurar valores por defecto")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
