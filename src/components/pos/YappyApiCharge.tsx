"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useT } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Charge {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";
  providerTxId: string | null;
  error: string | null;
}

/**
 * Cobro automático de Yappy: envía la solicitud al celular del cliente y, cuando
 * la pasarela confirma el pago, registra la venta sola.
 */
export function YappyApiCharge({
  amount,
  disabled,
  onPaid,
  onManual,
}: {
  amount: number;
  disabled: boolean;
  onPaid: (chargeId: string) => void;
  onManual: () => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const handled = useRef<string | null>(null);

  const { data: charge } = useSWR<Charge>(chargeId ? `/api/yappy/charges/${chargeId}` : null, fetcher, {
    refreshInterval: (latest) => (!latest || latest.status === "PENDING" ? 2000 : 0),
  });

  useEffect(() => {
    if (charge?.status === "PAID" && handled.current !== charge.id) {
      handled.current = charge.id;
      onPaid(charge.id);
    }
  }, [charge, onPaid]);

  async function send() {
    setSending(true);
    try {
      const created = await api<Charge>("/api/yappy/charges", { body: { amount, phone } });
      setChargeId(created.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  async function cancel() {
    if (chargeId) await api(`/api/yappy/charges/${chargeId}/cancel`, { body: {} }).catch(() => {});
    setChargeId(null);
  }

  const status = charge?.status;
  return (
    <div className="rounded-xl bg-slate-50 p-3 space-y-3">
      {!chargeId || status === "CANCELLED" ? (
        <>
          <Input
            label={t("pos.yappyPhone")}
            inputMode="tel"
            placeholder="6123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button className="w-full" onClick={send} loading={sending} disabled={disabled || phone.replace(/\D/g, "").length < 8}>
            <Smartphone className="w-4 h-4" /> {t("pos.yappySend")} · {fmt.money(amount)}
          </Button>
        </>
      ) : status === "PENDING" || !status ? (
        <div className="space-y-2 text-center" role="status">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-brand-600" aria-hidden="true" />
          <p className="text-sm text-slate-700">{t("pos.yappyWaiting")}</p>
          <Button variant="ghost" size="sm" onClick={cancel}>
            {t("pos.cancel")}
          </Button>
        </div>
      ) : status === "PAID" ? (
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-300" role="status">
          <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> {t("pos.yappyPaid")}
        </p>
      ) : (
        <div className="space-y-2 text-center" role="alert">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-red-600">
            <XCircle className="w-5 h-5" aria-hidden="true" />
            {status === "EXPIRED" ? t("pos.yappyExpired") : t("pos.yappyFailed")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setChargeId(null)}>
            {t("pos.yappyRetry")}
          </Button>
        </div>
      )}
      <button type="button" onClick={onManual} disabled={disabled} className="text-xs text-slate-500 underline w-full">
        {t("pos.yappyManual")}
      </button>
    </div>
  );
}
