"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useT, useText } from "@/lib/client/i18n";
import { countryConfig } from "@/lib/country";
import type { PaymentMethod } from "@/lib/client/types";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

type Kind = "RECHARGE" | "BILL" | "OTHER";

interface ServiceSale {
  id: string;
  kind: Kind;
  provider: string;
  reference: string | null;
  amount: number;
  commission: number;
  paymentMethod: PaymentMethod;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
}

const KIND_LABEL: Record<Kind, string> = { RECHARGE: "Recarga", BILL: "Pago de servicio", OTHER: "Otro" };
const OTHER = "__other__";

/**
 * Registro de recargas y pagos de servicios que se procesan en la terminal del proveedor:
 * el efectivo entra a la caja (se le debe al proveedor) y la comisión cuenta como ingreso.
 */
export function ServicesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tr = useText();
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const { data, mutate } = useSWR<{
    providers: { name: string; kind: Kind; commissionRate: number }[];
    today: ServiceSale[];
  }>(open ? "/api/services" : null, fetcher);
  const methods = countryConfig(business.country).paymentMethods.filter((m) => m !== "CREDIT");
  const [provider, setProvider] = useState("");
  const [otherName, setOtherName] = useState("");
  const [kind, setKind] = useState<Kind>("RECHARGE");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);

  const selected = data?.providers.find((p) => p.name === provider);
  const effectiveKind = selected?.kind ?? kind;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/services", {
        body: {
          kind: effectiveKind,
          provider: provider === OTHER || !provider ? otherName : provider,
          reference: reference || null,
          amount: Number(amount.replace(",", ".")),
          paymentMethod,
        },
      });
      toast.success(tr("Registrado. Recuerda procesarlo en la terminal del proveedor."));
      setReference("");
      setAmount("");
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(sale: ServiceSale) {
    try {
      await api(`/api/services/${sale.id}/cancel`, { method: "POST" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr("Recargas y servicios")}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-600">
          {tr(
            "Cobra aquí lo que procesas en la terminal del proveedor para que la caja cuadre y tu comisión cuente como ganancia."
          )}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Select label={tr("Proveedor")} value={provider} onChange={(e) => setProvider(e.target.value)} required>
            <option value="">{tr("Selecciona")}</option>
            {data?.providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {tr(KIND_LABEL[p.kind])}
              </option>
            ))}
            <option value={OTHER}>{tr("Otro")}</option>
          </Select>
          {provider === OTHER ? (
            <Input
              label={tr("Nombre del proveedor")}
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              required
            />
          ) : (
            <Select
              label={tr("Tipo")}
              value={effectiveKind}
              onChange={(e) => setKind(e.target.value as Kind)}
              disabled={Boolean(selected)}
            >
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {tr(KIND_LABEL[k])}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={effectiveKind === "RECHARGE" ? tr("Número de celular") : tr("Número de cuenta o referencia")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            inputMode={effectiveKind === "RECHARGE" ? "tel" : "text"}
          />
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <Select
          label={tr("Forma de pago")}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {t(`pay.${m}` as never)}
            </option>
          ))}
        </Select>
        {selected && selected.commissionRate > 0 && Number(amount) > 0 && (
          <p className="text-sm text-brand-700 dark:text-brand-300">
            {tr("Tu comisión: {amount}", {
              amount: fmt.money(Math.round(Number(amount) * selected.commissionRate * 100) / 100),
            })}
          </p>
        )}
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Registrar cobro")}
        </Button>
      </form>

      {data && data.today.length > 0 && (
        <section className="mt-5 space-y-2" aria-labelledby="servicios-hoy">
          <h3 id="servicios-hoy" className="text-sm font-semibold text-slate-700">
            {tr("Hoy")}
          </h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.today.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                <span className={s.status === "CANCELLED" ? "line-through text-slate-500" : "text-slate-900"}>
                  {s.provider}
                  {s.reference ? ` · ${s.reference}` : ""}
                  <span className="text-xs text-slate-500"> · {fmt.dateTime(s.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{fmt.money(s.amount)}</span>
                  {s.status === "CANCELLED" ? (
                    <Badge tone="gray">{tr("Anulado")}</Badge>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => cancel(s)}>
                      {tr("Anular")}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
