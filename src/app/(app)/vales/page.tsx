"use client";

import { useState } from "react";
import useSWR from "swr";
import { Gift, Plus, Printer } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useDebounce } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import { useT, useText } from "@/lib/client/i18n";
import { countryConfig } from "@/lib/country";
import type { PaymentMethod } from "@/lib/client/types";
import { useIsOwner, useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

interface GiftCard {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  status: "ACTIVE" | "VOID";
  customerName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const mask = (code: string) => `•••• ${code.slice(-4)}`;

/** Vales y tarjetas de regalo: emitir, consultar saldo, imprimir y anular. */
export default function GiftCardsPage() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const isOwner = useIsOwner();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data, error, mutate } = useSWR<GiftCard[]>(withQuery("/api/gift-cards", { search: debounced }), fetcher);
  const [issuing, setIssuing] = useState(false);

  async function voidCard(card: GiftCard) {
    const ok = await confirm({
      title: tr("Anular vale {code}", { code: mask(card.code) }),
      message: tr("El saldo de {amount} dejará de poder usarse. No se devuelve dinero.", {
        amount: fmt.money(card.balance),
      }),
      danger: true,
      confirmLabel: tr("Anular"),
    });
    if (!ok) return;
    try {
      await api(`/api/gift-cards/${card.id}/void`, { method: "POST" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Vales")}
        description={tr("Tarjetas de regalo que tus clientes pagan hoy y usan después")}
        actions={
          <Button onClick={() => setIssuing(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Vender vale")}
          </Button>
        }
      />
      <SearchBar value={search} onChange={setSearch} placeholder={tr("Buscar por últimos 4 dígitos o nombre")} />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Gift}
          title={tr("Sin vales")}
          description={tr(
            "Vende vales para regalos o como saldo a favor; se cobran como forma de pago en el punto de venta."
          )}
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 tabular-nums">
                      {mask(c.code)}
                      {c.customerName ? ` · ${c.customerName}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmt.date(c.createdAt)} · {tr("Valor")} {fmt.money(c.initialAmount)}
                      {c.expiresAt ? ` · ${tr("Vence:")} ${fmt.date(c.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === "VOID" ? (
                      <Badge tone="gray">{tr("Anulado")}</Badge>
                    ) : (
                      <span className="font-semibold tabular-nums">{fmt.money(c.balance)}</span>
                    )}
                    <a
                      href={`/vales/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={tr("Imprimir vale {code}", { code: mask(c.code) })}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Printer className="w-4 h-4" aria-hidden="true" />
                    </a>
                    {isOwner && c.status === "ACTIVE" && (
                      <Button size="sm" variant="ghost" onClick={() => voidCard(c)}>
                        {tr("Anular")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {issuing && (
        <IssueModal
          onClose={() => setIssuing(false)}
          onIssued={(card) => {
            setIssuing(false);
            mutate();
            window.open(`/vales/${card.id}`, "_blank");
          }}
        />
      )}
    </div>
  );
}

function IssueModal({ onClose, onIssued }: { onClose: () => void; onIssued: (card: GiftCard) => void }) {
  const tr = useText();
  const t = useT();
  const toast = useToast();
  const { business } = useSession();
  const methods = countryConfig(business.country).paymentMethods.filter((m) => m !== "CREDIT");
  const [amount, setAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const card = await api<GiftCard>("/api/gift-cards", {
        body: {
          amount: Number(amount.replace(",", ".")),
          customerName: customerName || null,
          expiresAt: expiresAt ? `${expiresAt}T23:59:59` : null,
          paymentMethod,
        },
      });
      toast.success(tr("Vale emitido"));
      onIssued(card);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Vender vale")}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr("Para (opcional)")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <Input
            label={tr("Vence (opcional)")}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">
          {tr("El dinero entra a la caja pero no cuenta como venta hasta que el vale se usa.")}
        </p>
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Emitir e imprimir")}
        </Button>
      </form>
    </Modal>
  );
}
