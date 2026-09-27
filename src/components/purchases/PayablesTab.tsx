"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import useSWR from "swr";
import { FileText, HandCoins, Plus, ThumbsUp } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import type { Supplier } from "@/lib/client/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { countryConfig } from "@/lib/country";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, Stat } from "@/components/ui/Misc";

export interface Bill {
  id: string;
  number: string | null;
  status: "OPEN" | "PAID" | "CANCELLED";
  supplierId: string | null;
  supplierName: string | null;
  supplier: { id: string; name: string; phone: string | null } | null;
  purchase: { id: string; folio: number } | null;
  date: string;
  dueDate: string;
  total: number;
  tax: number;
  balance: number;
  notes: string | null;
  daysOverdue?: number;
  payments: {
    id: string;
    amount: number;
    method: string;
    fromCash: boolean;
    reference: string | null;
    voidedAt: string | null;
    createdAt: string;
  }[];
}

interface Summary {
  total: number;
  aging: { current: number; d1_30: number; d31_60: number; d60plus: number };
  overdue: { amount: number; count: number };
  dueThisWeek: { amount: number; count: number };
  suppliers: { supplierId: string | null; name: string; balance: number; bills: number }[];
  bills: Bill[];
}

/** Fecha guardada como día calendario (medianoche UTC). */
function useDay() {
  const fmt = useFormat();
  return (iso: string) =>
    new Intl.DateTimeFormat(fmt.locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(iso)
    );
}

/** Cuentas por pagar: antigüedad de saldos, facturas abiertas, abonos y estado de cuenta. */
export function PayablesTab() {
  const tr = useText();
  const fmt = useFormat();
  const day = useDay();
  const { data, error, mutate } = useSWR<Summary>("/api/payables", fetcher);
  const [history, setHistory] = useState(false);
  const closed = useSWR<{ bills: Bill[] }>(history ? "/api/payables?history=true" : null, fetcher);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [statement, setStatement] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;

  const refresh = () => {
    mutate();
    closed.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label={tr("Total por pagar")} value={fmt.money(data.total)} />
        <Stat
          label={tr("Vencido")}
          value={fmt.money(data.overdue.amount)}
          hint={tr("{n} factura(s)", { n: data.overdue.count })}
          tone={data.overdue.count > 0 ? "negative" : "default"}
        />
        <Stat
          label={tr("Vence esta semana")}
          value={fmt.money(data.dueThisWeek.amount)}
          hint={tr("{n} factura(s)", { n: data.dueThisWeek.count })}
          tone={data.dueThisWeek.count > 0 ? "warning" : "default"}
        />
      </div>
      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold text-slate-900 mb-2">{tr("Antigüedad de saldos")}</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {(
              [
                ["current", tr("Al corriente")],
                ["d1_30", tr("1 a 30 días")],
                ["d31_60", tr("31 a 60 días")],
                ["d60plus", tr("Más de 60 días")],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd
                  className={`font-semibold tabular-nums ${key !== "current" && data.aging[key] > 0 ? "text-red-600" : "text-slate-900"}`}
                >
                  {fmt.money(data.aging[key])}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Checkbox
          label={tr("Ver pagadas y canceladas")}
          checked={history}
          onChange={(e) => setHistory(e.target.checked)}
        />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Registrar factura")}
        </Button>
      </div>

      {history ? (
        closed.error ? (
          <ErrorState error={closed.error} />
        ) : !closed.data ? (
          <ListSkeleton />
        ) : closed.data.bills.length === 0 ? (
          <p className="text-sm text-slate-500">{tr("Sin facturas pagadas todavía.")}</p>
        ) : (
          <ul className="space-y-2">
            {closed.data.bills.map((b) => (
              <BillCard key={b.id} bill={b} onStatement={setStatement} onChanged={refresh} />
            ))}
          </ul>
        )
      ) : data.bills.length === 0 ? (
        <EmptyState
          icon={ThumbsUp}
          title={tr("Nada por pagar")}
          description={tr("Las compras a crédito y las facturas que registres aparecerán aquí hasta que las pagues.")}
        />
      ) : (
        <ul className="space-y-2">
          {data.bills.map((b) => (
            <BillCard key={b.id} bill={b} onPay={setPaying} onStatement={setStatement} onChanged={refresh} />
          ))}
        </ul>
      )}

      {creating && (
        <BillForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {paying && (
        <PaymentForm
          bill={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            refresh();
          }}
        />
      )}
      {statement && <StatementModal supplierId={statement} onClose={() => setStatement(null)} day={day} />}
    </div>
  );
}

function BillCard({
  bill,
  onPay,
  onStatement,
  onChanged,
}: {
  bill: Bill;
  onPay?: (bill: Bill) => void;
  onStatement: (supplierId: string) => void;
  onChanged: () => void;
}) {
  const tr = useText();
  const fmt = useFormat();
  const day = useDay();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = useSession();
  const taxLabel = countryConfig(business.country).taxLabel;
  const name = bill.supplier?.name ?? bill.supplierName ?? tr("Sin proveedor");
  const active = bill.payments.filter((p) => !p.voidedAt);

  async function voidPayment(id: string, amount: number) {
    const reason = await confirm({
      title: tr("Anular abono de {amount}", { amount: fmt.money(amount) }),
      message: tr("El monto vuelve al saldo de la factura. Si salió de la caja, regresa como entrada."),
      inputLabel: tr("Motivo"),
      danger: true,
      confirmLabel: tr("Anular abono"),
    });
    if (typeof reason !== "string") return;
    try {
      await api(`/api/payables/payments/${id}/void`, { body: { reason } });
      toast.success(tr("Abono anulado"));
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function cancel() {
    const reason = await confirm({
      title: tr("Cancelar factura"),
      message: tr("La factura deja de estar por pagar."),
      inputLabel: tr("Motivo"),
      danger: true,
      confirmLabel: tr("Cancelar factura"),
    });
    if (typeof reason !== "string") return;
    try {
      await api(`/api/payables/${bill.id}/cancel`, { body: { reason } });
      toast.success(tr("Factura cancelada"));
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <li>
      <Card>
        <CardContent className="space-y-2">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900 truncate">{name}</p>
              <p className="text-xs text-slate-500">
                {bill.number ? tr("Factura {n}", { n: bill.number }) : tr("Sin número de factura")}
                {bill.purchase && ` · ${tr("Compra #{folio}", { folio: bill.purchase.folio })}`}
                {` · ${tr("vence {date}", { date: day(bill.dueDate) })}`}
              </p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {bill.status === "PAID" && <Badge tone="green">{tr("Pagada")}</Badge>}
                {bill.status === "CANCELLED" && <Badge tone="gray">{tr("Cancelada")}</Badge>}
                {bill.status === "OPEN" && (bill.daysOverdue ?? 0) > 0 && (
                  <Badge tone="red">{tr("Vencida hace {n} días", { n: bill.daysOverdue ?? 0 })}</Badge>
                )}
                {bill.tax > 0 && <Badge tone="blue">{`${taxLabel} ${fmt.money(bill.tax)}`}</Badge>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-semibold tabular-nums text-slate-900">{fmt.money(bill.balance)}</p>
              <p className="text-xs text-slate-500">{tr("de {total}", { total: fmt.money(bill.total) })}</p>
            </div>
          </div>
          {active.length > 0 && (
            <ul className="text-xs text-slate-600 space-y-0.5">
              {active.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {fmt.dateTime(p.createdAt)} · {tr(PAYMENT_METHOD_LABELS[p.method] ?? p.method)}
                    {p.fromCash && ` · ${tr("de la caja")}`}
                    {p.reference && ` · ${p.reference}`}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{fmt.money(p.amount)}</span>
                    {bill.status !== "CANCELLED" && (
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => voidPayment(p.id, p.amount)}
                        aria-label={tr("Anular abono de {amount}", { amount: fmt.money(p.amount) })}
                      >
                        {tr("Anular")}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 flex-wrap justify-end">
            {bill.supplierId && (
              <Button size="sm" variant="secondary" onClick={() => onStatement(bill.supplierId!)}>
                <FileText className="w-4 h-4" aria-hidden="true" /> {tr("Estado de cuenta")}
              </Button>
            )}
            {bill.status === "OPEN" && !bill.purchase && active.length === 0 && (
              <Button size="sm" variant="secondary" onClick={cancel}>
                {tr("Cancelar factura")}
              </Button>
            )}
            {bill.status === "OPEN" && onPay && (
              <Button size="sm" onClick={() => onPay(bill)}>
                <HandCoins className="w-4 h-4" aria-hidden="true" /> {tr("Abonar")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function BillForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const { business } = useSession();
  const { data: suppliers } = useSWR<Supplier[]>("/api/suppliers", fetcher);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayKey(business.timezone));
  const [dueDate, setDueDate] = useState("");
  const [total, setTotal] = useState("");
  const [tax, setTax] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/payables", {
        body: {
          supplierId: supplierId || null,
          supplierName: supplierId ? null : supplierName || null,
          number: number || null,
          date: date || null,
          dueDate: dueDate || null,
          total,
          tax: tax === "" ? null : tax,
          notes: notes || null,
        },
      });
      toast.success(tr("Factura registrada"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Registrar factura por pagar")}>
      <form onSubmit={save} className="space-y-3">
        <Select label={tr("Proveedor")} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">{tr("Otro / sin registrar")}</option>
          {suppliers?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {!supplierId && (
          <Input
            label={tr("Nombre del proveedor")}
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            required
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr("Número de factura")} value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input
            label={tr("Total")}
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr("Fecha de la factura")} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            label={tr("Vencimiento")}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            hint={tr("Vacío: según los días de crédito del proveedor")}
          />
        </div>
        <Input
          label={tr("Impuesto incluido ({tax})", { tax: countryConfig(business.country).taxLabel })}
          inputMode="decimal"
          value={tax}
          onChange={(e) => setTax(e.target.value)}
          placeholder="0.00"
          hint={tr("Sirve para el crédito fiscal")}
        />
        <Input
          label={tr("Notas")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr("Opcional")}
        />
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Guardar")}
        </Button>
      </form>
    </Modal>
  );
}

const PAY_METHODS = ["TRANSFER", "CASH", "CARD", "YAPPY"] as const;

function PaymentForm({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const [amount, setAmount] = useState(String(bill.balance));
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]>("TRANSFER");
  const [fromCash, setFromCash] = useState(true);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/payables/${bill.id}/payments`, {
        body: { amount, method, fromCash: method === "CASH" && fromCash, reference: reference || null },
      });
      toast.success(tr("Abono registrado"));
      onSaved();
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
      title={tr("Abonar a {name}", { name: bill.supplier?.name ?? bill.supplierName ?? "" })}
    >
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-600">{tr("Saldo pendiente: {amount}", { amount: fmt.money(bill.balance) })}</p>
        <Input
          label={tr("Monto")}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Select
          label={tr("Forma de pago")}
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof PAY_METHODS)[number])}
        >
          {PAY_METHODS.map((m) => (
            <option key={m} value={m}>
              {tr(PAYMENT_METHOD_LABELS[m])}
            </option>
          ))}
        </Select>
        {method === "CASH" ? (
          <Checkbox
            label={tr("Sale del efectivo de la caja (entra al corte)")}
            checked={fromCash}
            onChange={(e) => setFromCash(e.target.checked)}
          />
        ) : (
          <Input
            label={tr("Referencia")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={tr("Número de operación del banco")}
          />
        )}
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Registrar abono")}
        </Button>
      </form>
    </Modal>
  );
}

interface Statement {
  supplier: { id: string; name: string; phone: string | null; creditDays: number };
  lines: {
    date: string;
    kind: "BILL" | "PAYMENT";
    description: string;
    charge: number;
    payment: number;
    balance: number;
  }[];
  balance: number;
}

function StatementModal({
  supplierId,
  onClose,
  day,
}: {
  supplierId: string;
  onClose: () => void;
  day: (iso: string) => string;
}) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error } = useSWR<Statement>(`/api/suppliers/${supplierId}/statement`, fetcher);
  return (
    <Modal
      open
      onClose={onClose}
      title={data ? tr("Estado de cuenta: {name}", { name: data.supplier.name }) : tr("Estado de cuenta")}
      size="lg"
    >
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {tr("Crédito de {n} días · saldo {amount}", {
              n: data.supplier.creditDays,
              amount: fmt.money(data.balance),
            })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <caption className="sr-only">{tr("Estado de cuenta")}</caption>
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th scope="col" className="py-1 font-medium">
                    {tr("Fecha")}
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    {tr("Concepto")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Cargo")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Abono")}
                  </th>
                  <th scope="col" className="py-1 font-medium text-right">
                    {tr("Saldo")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{l.kind === "BILL" ? day(l.date) : fmt.date(l.date)}</td>
                    <td className="py-1.5">{l.description}</td>
                    <td className="py-1.5 text-right tabular-nums">{l.charge > 0 ? fmt.money(l.charge) : ""}</td>
                    <td className="py-1.5 text-right tabular-nums">{l.payment > 0 ? fmt.money(l.payment) : ""}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{fmt.money(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
