"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useT, useText } from "@/lib/client/i18n";
import type { CashSession } from "@/lib/client/types";
import { countryConfig } from "@/lib/country";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader, Stat } from "@/components/ui/Misc";

interface Summary {
  session: CashSession;
  salesByMethod?: Record<string, { total: number; count: number }>;
  cashSales?: number;
  customerPayments?: number;
  cashIn?: number;
  cashOut?: number;
  refunds?: number;
  cashExpenses?: number;
  cashPurchases?: number;
  expected?: number;
  movements: { id: string; type: "IN" | "OUT"; amount: number; reason: string; createdAt: string }[];
}

interface CashData {
  current: Summary | null;
  history: CashSession[];
}

export default function CashPage() {
  const tr = useText();
  const { role, business } = useSession();
  const isOwner = role === "OWNER";
  const fmt = useFormat();
  const t = useT();
  const toast = useToast();
  const { data, error, mutate } = useSWR<CashData>("/api/cash", fetcher, { refreshInterval: 30_000 });
  const [opening, setOpening] = useState("");
  const [movementOpen, setMovementOpen] = useState(false);
  const [movement, setMovement] = useState({ type: "OUT", amount: "", reason: "" });
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [closedResult, setClosedResult] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const detailData = useSWR<Summary>(detail ? `/api/cash/${detail}` : null, fetcher);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/cash/open", { body: { openingAmount: Number(opening) || 0 } });
      toast.success(t("cash.open"));
      setOpening("");
      mutate();
    });
  };

  const addMovement = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api("/api/cash/movements", { body: { ...movement, amount: Number(movement.amount) } });
      toast.success(movement.type === "IN" ? "Entrada registrada" : "Salida registrada");
      setMovementOpen(false);
      setMovement({ type: "OUT", amount: "", reason: "" });
      mutate();
    });
  };

  const close = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const result = await api<Summary>("/api/cash/close", {
        body: { countedAmount: Number(counted), notes: closeNotes || null },
      });
      setCloseOpen(false);
      setCounted("");
      setCloseNotes("");
      setClosedResult(result);
      mutate();
    });
  };

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  const current = data.current;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("cash.title")}
        description={t("cash.subtitle")}
        actions={
          current && (
            <>
              <Button variant="secondary" onClick={() => setMovementOpen(true)}>
                {t("cash.inOut")}
              </Button>
              <Button variant="danger" onClick={() => setCloseOpen(true)}>
                <Lock className="w-4 h-4" /> {t("cash.close")}
              </Button>
            </>
          )
        }
      />

      {!current ? (
        <Card className="max-w-md">
          <CardContent>
            <form onSubmit={open} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-amber-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{t("cash.closed")}</p>
                  <p className="text-sm text-slate-500">{t("cash.closedHint")}</p>
                </div>
              </div>
              <Input
                label={t("cash.opening")}
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
              <Button type="submit" className="w-full" loading={busy}>
                <Unlock className="w-4 h-4" /> {t("cash.open")}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {t("cash.openSince", {
              date: fmt.dateTime(current.session.openedAt),
              amount: fmt.money(current.session.openingAmount),
            })}
          </p>
          {isOwner && current.expected !== undefined && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label={t("cash.expected")} value={fmt.money(current.expected)} tone="positive" />
              <Stat label={t("cash.cashSales")} value={fmt.money(current.cashSales)} />
              <Stat label={t("cash.customerPayments")} value={fmt.money(current.customerPayments)} />
              <Stat
                label={t("cash.outflows")}
                value={fmt.money(
                  (current.cashOut ?? 0) +
                    (current.refunds ?? 0) +
                    (current.cashExpenses ?? 0) +
                    (current.cashPurchases ?? 0)
                )}
                hint={t("cash.outflowsHint")}
              />
            </div>
          )}
          {isOwner && current.salesByMethod && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">{t("cash.byMethod")}</h2>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {countryConfig(business.country)
                  .paymentMethods.map((method) => [method, t(`pay.${method}`)] as const)
                  .map(([method, label]) => (
                    <div key={method}>
                      <p className="text-slate-500">{label}</p>
                      <p className="font-semibold text-slate-900">
                        {fmt.money(current.salesByMethod?.[method]?.total ?? 0)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t("cash.salesCount", { count: current.salesByMethod?.[method]?.count ?? 0 })}
                      </p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
          {!isOwner && <p className="text-sm text-slate-500">{t("cash.blindCount")}</p>}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{t("cash.movements")}</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {current.movements.length === 0 && <p className="text-sm text-slate-500">{t("cash.noMovements")}</p>}
              {current.movements.map((m) => (
                <div key={m.id} className="flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    {m.type === "IN" ? (
                      <ArrowDownCircle className="w-4 h-4 text-brand-600" />
                    ) : (
                      <ArrowUpCircle className="w-4 h-4 text-red-600" />
                    )}
                    {m.reason} <span className="text-xs text-slate-500">{fmt.dateTime(m.createdAt)}</span>
                  </span>
                  <span className={m.type === "IN" ? "text-brand-600" : "text-red-600"}>
                    {m.type === "IN" ? "+" : "-"}
                    {fmt.money(m.amount)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {isOwner && data.history.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{t("cash.history")}</h2>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-0">
            {data.history.map((s) => (
              <button
                key={s.id}
                onClick={() => setDetail(s.id)}
                className="w-full flex justify-between py-3 text-sm text-left hover:bg-slate-50 -mx-5 px-5"
              >
                <span className="text-slate-700">
                  {fmt.dateTime(s.closedAt!)}
                  <span className="block text-xs text-slate-500">
                    {t("cash.expectedCounted", {
                      expected: fmt.money(s.expectedAmount),
                      counted: fmt.money(s.countedAmount),
                    })}
                  </span>
                </span>
                <DifferenceLabel value={s.difference ?? 0} />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal open={movementOpen} onClose={() => setMovementOpen(false)} title={t("cash.movementTitle")}>
        <form onSubmit={addMovement} className="space-y-3">
          <Select
            label={t("cash.type")}
            value={movement.type}
            onChange={(e) => setMovement({ ...movement, type: e.target.value })}
          >
            <option value="OUT">{t("cash.typeOut")}</option>
            <option value="IN">{t("cash.typeIn")}</option>
          </Select>
          <Input
            label={t("cash.amount")}
            inputMode="decimal"
            value={movement.amount}
            onChange={(e) => setMovement({ ...movement, amount: e.target.value })}
            required
          />
          <Input
            label={t("cash.reason")}
            value={movement.reason}
            onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
            required
          />
          <Button type="submit" className="w-full" loading={busy}>
            {t("cash.register")}
          </Button>
        </form>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title={t("cash.closeTitle")}>
        <form onSubmit={close} className="space-y-3">
          <p className="text-sm text-slate-600">{t("cash.closeHint")}</p>
          <Input
            label={t("cash.counted")}
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            required
            autoFocus
          />
          <Input
            label={t("common.notes")}
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder={tr("Opcional")}
          />
          <Button type="submit" variant="danger" className="w-full" loading={busy}>
            {t("cash.doClose")}
          </Button>
        </form>
      </Modal>

      <Modal open={closedResult !== null} onClose={() => setClosedResult(null)} title={t("cash.closedTitle")}>
        {closedResult && (
          <div className="space-y-3 text-sm">
            <p>
              {t("cash.counted")}: {fmt.money(closedResult.session.countedAmount)}
            </p>
            {closedResult.expected !== undefined && (
              <>
                <p>
                  {t("cash.expected")}: {fmt.money(closedResult.expected)}
                </p>
                <p className="text-lg">
                  {t("cash.difference")}: <DifferenceLabel value={closedResult.session.difference ?? 0} />
                </p>
              </>
            )}
            <Button className="w-full" onClick={() => setClosedResult(null)}>
              {t("cash.done")}
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={tr("Detalle del corte")}>
        {!detailData.data ? (
          <ListSkeleton rows={3} />
        ) : (
          <dl className="space-y-1 text-sm">
            {[
              ["Fondo inicial", detailData.data.session.openingAmount],
              ["Ventas en efectivo", detailData.data.cashSales],
              ["Abonos de clientes", detailData.data.customerPayments],
              ["Entradas", detailData.data.cashIn],
              ["Salidas", -(detailData.data.cashOut ?? 0)],
              ["Devoluciones", -(detailData.data.refunds ?? 0)],
              ["Gastos de caja", -(detailData.data.cashExpenses ?? 0)],
              ["Compras de caja", -(detailData.data.cashPurchases ?? 0)],
              ["Esperado", detailData.data.session.expectedAmount],
              ["Contado", detailData.data.session.countedAmount],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <dt className="text-slate-600">{label}</dt>
                <dd className="tabular-nums">{fmt.money(value as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2">
              <dt>{tr("Diferencia")}</dt>
              <dd>
                <DifferenceLabel value={detailData.data.session.difference ?? 0} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function DifferenceLabel({ value }: { value: number }) {
  const fmt = useFormat();
  const t = useT();
  if (Math.abs(value) < 0.005) return <span className="text-brand-600 font-semibold">{t("cash.balanced")}</span>;
  return (
    <span className={value < 0 ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>
      {value < 0 ? t("cash.short") : t("cash.over")} {fmt.money(Math.abs(value))}
    </span>
  );
}
