"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Wallet } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { CashSession } from "@/lib/client/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
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
  const { role } = useSession();
  const isOwner = role === "OWNER";
  const fmt = useFormat();
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
      toast.success("Caja abierta");
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
      const result = await api<Summary>("/api/cash/close", { body: { countedAmount: Number(counted), notes: closeNotes || null } });
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
        title="Caja"
        description="Apertura, entradas/salidas y corte"
        actions={
          current && (
            <>
              <Button variant="secondary" onClick={() => setMovementOpen(true)}>
                Entrada / salida
              </Button>
              <Button variant="danger" onClick={() => setCloseOpen(true)}>
                <Lock className="w-4 h-4" /> Hacer corte
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
                  <p className="font-semibold text-slate-900">La caja está cerrada</p>
                  <p className="text-sm text-slate-500">Cuenta el fondo inicial para empezar el turno.</p>
                </div>
              </div>
              <Input label="Fondo inicial (efectivo)" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" autoFocus />
              <Button type="submit" className="w-full" loading={busy}>
                <Unlock className="w-4 h-4" /> Abrir caja
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Turno abierto desde {fmt.dateTime(current.session.openedAt)} con fondo de {fmt.money(current.session.openingAmount)}.
          </p>
          {isOwner && current.expected !== undefined && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Efectivo esperado" value={fmt.money(current.expected)} tone="positive" />
              <Stat label="Ventas en efectivo" value={fmt.money(current.cashSales)} />
              <Stat label="Abonos de clientes" value={fmt.money(current.customerPayments)} />
              <Stat
                label="Salidas"
                value={fmt.money((current.cashOut ?? 0) + (current.refunds ?? 0) + (current.cashExpenses ?? 0) + (current.cashPurchases ?? 0))}
                hint="Retiros, devoluciones, gastos y compras"
              />
            </div>
          )}
          {isOwner && current.salesByMethod && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-slate-900">Ventas del turno por forma de pago</h2>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => (
                  <div key={method}>
                    <p className="text-slate-500">{label}</p>
                    <p className="font-semibold text-slate-900">{fmt.money(current.salesByMethod?.[method]?.total ?? 0)}</p>
                    <p className="text-xs text-slate-500">{current.salesByMethod?.[method]?.count ?? 0} ventas</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {!isOwner && (
            <p className="text-sm text-slate-500">
              Al hacer el corte cuenta el efectivo del cajón. El dueño verá la diferencia contra lo esperado.
            </p>
          )}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">Entradas y salidas</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {current.movements.length === 0 && <p className="text-sm text-slate-500">Sin movimientos manuales.</p>}
              {current.movements.map((m) => (
                <div key={m.id} className="flex justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700">
                    {m.type === "IN" ? <ArrowDownCircle className="w-4 h-4 text-brand-600" /> : <ArrowUpCircle className="w-4 h-4 text-red-600" />}
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
            <h2 className="font-semibold text-slate-900">Cortes anteriores</h2>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-0">
            {data.history.map((s) => (
              <button key={s.id} onClick={() => setDetail(s.id)} className="w-full flex justify-between py-3 text-sm text-left hover:bg-slate-50 -mx-5 px-5">
                <span className="text-slate-700">
                  {fmt.dateTime(s.closedAt!)}
                  <span className="block text-xs text-slate-500">
                    Esperado {fmt.money(s.expectedAmount)} · contado {fmt.money(s.countedAmount)}
                  </span>
                </span>
                <DifferenceLabel value={s.difference ?? 0} />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal open={movementOpen} onClose={() => setMovementOpen(false)} title="Entrada o salida de efectivo">
        <form onSubmit={addMovement} className="space-y-3">
          <Select label="Tipo" value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value })}>
            <option value="OUT">Salida (retiro, pago a proveedor, cambio al banco)</option>
            <option value="IN">Entrada (cambio, aportación)</option>
          </Select>
          <Input label="Monto" inputMode="decimal" value={movement.amount} onChange={(e) => setMovement({ ...movement, amount: e.target.value })} required />
          <Input label="Motivo" value={movement.reason} onChange={(e) => setMovement({ ...movement, reason: e.target.value })} required />
          <Button type="submit" className="w-full" loading={busy}>
            Registrar
          </Button>
        </form>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="Corte de caja">
        <form onSubmit={close} className="space-y-3">
          <p className="text-sm text-slate-600">Cuenta el efectivo que hay en el cajón (incluido el fondo inicial).</p>
          <Input label="Efectivo contado" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} required autoFocus />
          <Input label="Notas" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Opcional" />
          <Button type="submit" variant="danger" className="w-full" loading={busy}>
            Cerrar caja
          </Button>
        </form>
      </Modal>

      <Modal open={closedResult !== null} onClose={() => setClosedResult(null)} title="Caja cerrada">
        {closedResult && (
          <div className="space-y-3 text-sm">
            <p>Contado: {fmt.money(closedResult.session.countedAmount)}</p>
            {closedResult.expected !== undefined && (
              <>
                <p>Esperado: {fmt.money(closedResult.expected)}</p>
                <p className="text-lg">
                  Diferencia: <DifferenceLabel value={closedResult.session.difference ?? 0} />
                </p>
              </>
            )}
            <Button className="w-full" onClick={() => setClosedResult(null)}>
              Listo
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Detalle del corte">
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
              <dt>Diferencia</dt>
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
  if (Math.abs(value) < 0.005) return <span className="text-brand-600 font-semibold">Cuadra</span>;
  return (
    <span className={value < 0 ? "text-red-600 font-semibold" : "text-amber-600 font-semibold"}>
      {value < 0 ? "Faltan " : "Sobran "}
      {fmt.money(Math.abs(value))}
    </span>
  );
}
