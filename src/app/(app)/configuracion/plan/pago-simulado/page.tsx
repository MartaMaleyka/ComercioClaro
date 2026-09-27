"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { formatCurrency } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

interface Charge {
  id: string;
  status: string;
  amount: number;
  currency: string;
  planName: string | null;
  billingCycle: "MONTHLY" | "YEARLY";
}

/** Pasarela de pago simulada (BILLING_PROVIDER=simulado): reemplaza a Stripe Checkout en pruebas. */
function SimulatedCheckout() {
  const tr = useText();
  const toast = useToast();
  const router = useRouter();
  const { business } = useSession();
  const id = useSearchParams().get("cargo");
  const { data, error } = useSWR<Charge>(id ? `/api/billing/simulado?cargo=${encodeURIComponent(id)}` : null, fetcher);
  const [busy, setBusy] = useState<string | null>(null);

  async function pay(card: "4242" | "0002") {
    setBusy(card);
    try {
      await api("/api/billing/simulado", { method: "POST", body: { chargeId: id, card } });
      // refresh: si el negocio estaba suspendido, el layout vuelve a leer la sesión.
      router.push("/configuracion/plan?pago=ok");
      router.refresh();
    } catch (err) {
      toast.error(err);
      setBusy(null);
    }
  }

  if (error) return <ErrorState error={error} />;
  if (!data) return <ListSkeleton rows={2} />;
  return (
    <div className="space-y-4 max-w-md">
      <PageHeader title={tr("Pago de prueba")} description={tr("Modo de prueba: no se cobra dinero real.")} />
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-700">
            {tr("Plan {plan} ({cycle})", {
              plan: data.planName ?? "—",
              cycle: data.billingCycle === "YEARLY" ? tr("anual") : tr("mensual"),
            })}
          </p>
          <p className="text-2xl font-bold text-slate-900">
            {formatCurrency(data.amount, data.currency, business.locale)}
          </p>
          {data.status !== "PENDING" ? (
            <p className="text-sm text-slate-600">{tr("Este cobro ya fue procesado.")}</p>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => pay("4242")} loading={busy === "4242"} disabled={busy !== null}>
                <CreditCard className="w-4 h-4" aria-hidden="true" /> {tr("Pagar con tarjeta de prueba •••• 4242")}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => pay("0002")}
                loading={busy === "0002"}
                disabled={busy !== null}
              >
                {tr("Pagar con tarjeta •••• 0002 (se rechaza al renovar)")}
              </Button>
            </div>
          )}
          <Button variant="ghost" className="w-full" onClick={() => router.push("/configuracion/plan?pago=cancelado")}>
            {tr("Cancelar")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SimulatedCheckoutPage() {
  return (
    <Suspense>
      <SimulatedCheckout />
    </Suspense>
  );
}
