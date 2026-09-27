"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Lock, LockOpen, Plus } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { PAYMENT_METHOD_LABELS, cn } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState, ListSkeleton, PageHeader, Stat, ScrollArea } from "@/components/ui/Misc";

type Tab = "estados" | "diario" | "mayor" | "dueno" | "cierre";

interface Row {
  code: string;
  name: string;
  amount: number;
}

interface Statements {
  from: string;
  to: string;
  income: {
    sales: number;
    cogs: number;
    grossProfit: number;
    otherIncome: number;
    expenses: Row[];
    totalExpenses: number;
    netIncome: number;
  };
  balance: {
    assets: Row[];
    liabilities: Row[];
    equity: Row[];
    result: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanced: boolean;
  };
  cashFlow: {
    opening: number;
    operating: { kind: string; label: string; amount: number }[];
    financing: { kind: string; label: string; amount: number }[];
    change: number;
    closing: number;
  };
}

interface Line {
  account: { code: string; name: string };
  debit: number;
  credit: number;
}

interface Entry {
  date: string;
  kind: string;
  reference: string;
  description: string;
  lines: Line[];
}

interface LedgerAccount {
  code: string;
  name: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  lines: { date: string; reference: string; description: string; debit: number; credit: number; balance: number }[];
}

/** Rango de un mes "YYYY-MM". */
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default function AccountingPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Accounting />
    </Suspense>
  );
}

function Accounting() {
  const tr = useText();
  const { business } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "estados";
  const [month, setMonth] = useState(todayKey(business.timezone).slice(0, 7));
  const range = monthRange(month);

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Contabilidad")}
        description={tr("Se genera sola con tus ventas, compras, pagos y gastos. Lista para tu contador.")}
      />
      <Tabs
        label={tr("Contabilidad")}
        tabs={[
          { value: "estados", label: tr("Estados financieros") },
          { value: "diario", label: tr("Libro diario") },
          { value: "mayor", label: tr("Libro mayor") },
          { value: "dueno", label: tr("Aportes y retiros") },
          { value: "cierre", label: tr("Cierre de mes") },
        ]}
        value={tab}
        onChange={(t) => router.replace(t === "estados" ? "/contabilidad" : `/contabilidad?tab=${t}`)}
      />
      {(tab === "estados" || tab === "diario" || tab === "mayor") && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-48">
            <Input
              label={tr("Mes")}
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </div>
          <a
            href={withQuery("/api/accounting/journal", { ...range, format: "xls" })}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> {tr("Libros en Excel")}
          </a>
          <a
            href={withQuery("/api/accounting/journal", { ...range, format: "csv" })}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> {tr("Diario CSV")}
          </a>
          <a
            href={withQuery("/api/accounting/ledger", { ...range, format: "csv" })}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" /> {tr("Mayor CSV")}
          </a>
        </div>
      )}
      {tab === "estados" && <StatementsView range={range} />}
      {tab === "diario" && <JournalView range={range} />}
      {tab === "mayor" && <LedgerView range={range} />}
      {tab === "dueno" && <OwnerView />}
      {tab === "cierre" && <PeriodsView />}
    </div>
  );
}

function StatementTable({
  caption,
  rows,
  total,
  totalLabel,
}: {
  caption: string;
  rows: Row[];
  total: number;
  totalLabel: string;
}) {
  const tr = useText();
  const fmt = useFormat();
  return (
    <table className="w-full text-sm">
      <caption className="text-left font-semibold text-slate-900 pb-2">{caption}</caption>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.code}>
            <th scope="row" className="py-1.5 text-left font-normal text-slate-700">
              <span className="text-xs text-slate-500 mr-2">{r.code}</span>
              {tr(r.name)}
            </th>
            <td className="py-1.5 text-right tabular-nums">{fmt.money(r.amount)}</td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="py-1.5 text-left font-semibold text-slate-900">
            {totalLabel}
          </th>
          <td className="py-1.5 text-right tabular-nums font-semibold">{fmt.money(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function StatementsView({ range }: { range: { from: string; to: string } }) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Statements>(withQuery("/api/accounting/statements", range), fetcher);
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={6} />;
  const { income, balance, cashFlow } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={tr("Ventas netas (sin ITBMS)")} value={fmt.money(income.sales)} />
        <Stat label={tr("Utilidad bruta")} value={fmt.money(income.grossProfit)} tone="positive" />
        <Stat
          label={tr("Utilidad neta")}
          value={fmt.money(income.netIncome)}
          tone={income.netIncome >= 0 ? "positive" : "negative"}
        />
        <Stat label={tr("Efectivo y bancos al cierre")} value={fmt.money(cashFlow.closing)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Estado de resultados")}</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="text-sm space-y-1">
              {[
                [tr("Ventas"), income.sales],
                [tr("Costo de ventas"), -income.cogs],
                [tr("Utilidad bruta"), income.grossProfit],
                [tr("Otros ingresos"), income.otherIncome],
              ].map(([label, amount]) => (
                <div key={label as string} className="flex justify-between">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="tabular-nums">{fmt.money(amount as number)}</dd>
                </div>
              ))}
            </dl>
            <StatementTable
              caption={tr("Gastos")}
              rows={income.expenses}
              total={income.totalExpenses}
              totalLabel={tr("Total de gastos")}
            />
            <p
              className={cn(
                "flex justify-between font-bold border-t border-slate-100 pt-2",
                income.netIncome < 0 && "text-red-600"
              )}
            >
              <span>{tr("Utilidad neta")}</span>
              <span className="tabular-nums">{fmt.money(income.netIncome)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">{tr("Balance general")}</h2>
            <Badge tone={balance.balanced ? "green" : "red"}>{balance.balanced ? tr("Cuadra") : tr("No cuadra")}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatementTable
              caption={tr("Activo")}
              rows={balance.assets}
              total={balance.totalAssets}
              totalLabel={tr("Total activo")}
            />
            <StatementTable
              caption={tr("Pasivo")}
              rows={balance.liabilities}
              total={balance.totalLiabilities}
              totalLabel={tr("Total pasivo")}
            />
            <StatementTable
              caption={tr("Patrimonio")}
              rows={[...balance.equity, { code: "—", name: "Resultado acumulado", amount: balance.result }]}
              total={balance.totalEquity}
              totalLabel={tr("Total patrimonio")}
            />
            <p className="text-sm font-semibold flex justify-between border-t border-slate-100 pt-2">
              <span>{tr("Pasivo + patrimonio")}</span>
              <span className="tabular-nums">{fmt.money(balance.totalLiabilities + balance.totalEquity)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Flujo de efectivo")}</h2>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <dl>
              <div className="flex justify-between">
                <dt className="text-slate-600">{tr("Efectivo y bancos al inicio")}</dt>
                <dd className="tabular-nums">{fmt.money(cashFlow.opening)}</dd>
              </div>
            </dl>
            <h3 className="font-medium text-slate-900">{tr("Operación")}</h3>
            <dl className="space-y-1">
              {cashFlow.operating.map((l) => (
                <div key={l.kind} className="flex justify-between">
                  <dt className="text-slate-600 pl-3">{tr(l.label)}</dt>
                  <dd className="tabular-nums">{fmt.money(l.amount)}</dd>
                </div>
              ))}
            </dl>
            <h3 className="font-medium text-slate-900">{tr("Financiamiento")}</h3>
            {cashFlow.financing.length === 0 ? (
              <p className="text-slate-500 pl-3">{tr("Sin aportes ni retiros")}</p>
            ) : (
              <dl className="space-y-1">
                {cashFlow.financing.map((l) => (
                  <div key={l.kind} className="flex justify-between">
                    <dt className="text-slate-600 pl-3">{tr(l.label)}</dt>
                    <dd className="tabular-nums">{fmt.money(l.amount)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <dl>
              <div className="flex justify-between font-semibold border-t border-slate-100 pt-2">
                <dt>{tr("Efectivo y bancos al cierre")}</dt>
                <dd className="tabular-nums">{fmt.money(cashFlow.closing)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        {tr(
          "El inventario y el costo de ventas van sin ITBMS: el ITBMS de las compras es crédito fiscal. Por eso el costo puede ser menor que en Reportes."
        )}
      </p>
    </div>
  );
}

function JournalView({ range }: { range: { from: string; to: string } }) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<{ entries: Entry[]; total: number }>(
    withQuery("/api/accounting/journal", range),
    fetcher
  );
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={6} />;
  if (data.entries.length === 0) return <p className="text-sm text-slate-500">{tr("Sin asientos en el mes.")}</p>;
  return (
    <Card>
      <CardContent>
        {data.total > data.entries.length && (
          <p className="text-xs text-slate-500 mb-2">
            {tr("Se muestran los últimos {n} de {total} asientos. Descarga el libro completo en Excel.", {
              n: data.entries.length,
              total: data.total,
            })}
          </p>
        )}
        <ScrollArea label={tr("Libro diario")}>
          <table className="w-full text-sm min-w-[640px]">
            <caption className="sr-only">{tr("Libro diario")}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-1 font-medium">
                  {tr("Fecha")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {tr("Concepto")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {tr("Cuenta")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Debe")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Haber")}
                </th>
              </tr>
            </thead>
            {[...data.entries].reverse().map((e, i) => (
              <tbody key={i} className="border-t border-slate-200">
                {e.lines.map((l, j) => (
                  <tr key={j}>
                    <td className="py-1 text-slate-500 whitespace-nowrap">{j === 0 ? fmt.date(e.date) : ""}</td>
                    <td className="py-1 text-slate-700">{j === 0 ? `${e.reference} · ${tr(e.description)}` : ""}</td>
                    <td className={cn("py-1", l.credit > 0 && "pl-6")}>
                      <span className="text-xs text-slate-500 mr-1">{l.account.code}</span>
                      {tr(l.account.name)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{l.debit > 0 ? fmt.money(l.debit) : ""}</td>
                    <td className="py-1 text-right tabular-nums">{l.credit > 0 ? fmt.money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LedgerView({ range }: { range: { from: string; to: string } }) {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<{ accounts: LedgerAccount[] }>(
    withQuery("/api/accounting/ledger", range),
    fetcher
  );
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={6} />;
  return (
    <Card>
      <CardContent>
        <ScrollArea label={tr("Libro mayor")}>
          <table className="w-full text-sm min-w-[600px]">
            <caption className="sr-only">{tr("Libro mayor")}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-1 font-medium">
                  {tr("Cuenta")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Saldo inicial")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Debe")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Haber")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Saldo final")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.accounts.map((a) => (
                <tr key={a.code}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <button
                      type="button"
                      className="text-brand-700 dark:text-brand-300 hover:underline text-left"
                      onClick={() => setOpen(a.code)}
                    >
                      <span className="text-xs text-slate-500 mr-1">{a.code}</span>
                      {tr(a.name)}
                    </button>
                  </th>
                  <td className="py-1.5 text-right tabular-nums">{fmt.money(a.opening)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt.money(a.debit)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt.money(a.credit)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{fmt.money(a.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
      {open && <LedgerDetail account={data.accounts.find((a) => a.code === open)!} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function LedgerDetail({ account, onClose }: { account: LedgerAccount; onClose: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  return (
    <Modal open onClose={onClose} title={`${account.code} · ${tr(account.name)}`} size="lg">
      <ScrollArea label={tr(account.name)}>
        <table className="w-full text-sm min-w-[520px]">
          <caption className="sr-only">{tr(account.name)}</caption>
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th scope="col" className="py-1 font-medium">
                {tr("Fecha")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {tr("Concepto")}
              </th>
              <th scope="col" className="py-1 font-medium text-right">
                {tr("Debe")}
              </th>
              <th scope="col" className="py-1 font-medium text-right">
                {tr("Haber")}
              </th>
              <th scope="col" className="py-1 font-medium text-right">
                {tr("Saldo")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-1" />
              <td className="py-1 text-slate-600">{tr("Saldo inicial")}</td>
              <td className="py-1" />
              <td className="py-1" />
              <td className="py-1 text-right tabular-nums">{fmt.money(account.opening)}</td>
            </tr>
            {account.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 whitespace-nowrap text-slate-500">{fmt.date(l.date)}</td>
                <td className="py-1">
                  {l.reference} · {tr(l.description)}
                </td>
                <td className="py-1 text-right tabular-nums">{l.debit > 0 ? fmt.money(l.debit) : ""}</td>
                <td className="py-1 text-right tabular-nums">{l.credit > 0 ? fmt.money(l.credit) : ""}</td>
                <td className="py-1 text-right tabular-nums">{fmt.money(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Modal>
  );
}

interface OwnerTx {
  id: string;
  type: "CONTRIBUTION" | "WITHDRAWAL";
  amount: number;
  method: string;
  date: string;
  notes: string | null;
}

function OwnerView() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<OwnerTx[]>("/api/accounting/owner", fetcher);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "WITHDRAWAL", amount: "", method: "CASH", notes: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/accounting/owner", { body: { ...form, notes: form.notes || null } });
      toast.success(tr("Movimiento del dueño registrado"));
      setOpen(false);
      setForm({ type: "WITHDRAWAL", amount: "", method: "CASH", notes: "" });
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  const total = (type: string) => data.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {tr(
          "Separa tu dinero del negocio: lo que pones de tu bolsillo es un aporte, y lo que te llevas para tu casa es un retiro, no un gasto."
        )}
      </p>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 gap-3">
          <Stat label={tr("Aportes")} value={fmt.money(total("CONTRIBUTION"))} tone="positive" />
          <Stat label={tr("Retiros")} value={fmt.money(total("WITHDRAWAL"))} tone="warning" />
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Aporte o retiro")}
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("Aún no hay aportes ni retiros.")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {t.type === "CONTRIBUTION" ? tr("Aporte del dueño") : tr("Retiro del dueño")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmt.date(t.date)} · {tr(PAYMENT_METHOD_LABELS[t.method])}
                      {t.notes && ` · ${t.notes}`}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "font-semibold tabular-nums",
                      t.type === "CONTRIBUTION" ? "text-brand-600" : "text-red-600"
                    )}
                  >
                    {t.type === "CONTRIBUTION" ? "+" : "−"}
                    {fmt.money(t.amount)}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Aporte o retiro del dueño")}>
        <form onSubmit={save} className="space-y-3">
          <Select label={tr("Tipo")} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="WITHDRAWAL">{tr("Retiro: me llevo dinero del negocio")}</option>
            <option value="CONTRIBUTION">{tr("Aporte: pongo dinero en el negocio")}</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={tr("Monto")}
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
            <Select
              label={tr("Forma")}
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              <option value="CASH">{tr("Efectivo (caja)")}</option>
              <option value="TRANSFER">{tr("Transferencia")}</option>
              {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
            </Select>
          </div>
          <Input
            label={tr("Notas")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={tr("Opcional")}
          />
          <Button type="submit" className="w-full" loading={saving}>
            {tr("Guardar")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

interface Period {
  month: string;
  current: boolean;
  closedAt: string | null;
  reopenedAt: string | null;
}

function PeriodsView() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Period[]>("/api/accounting/periods", fetcher);
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(fmt.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}-01T12:00:00Z`)
    );

  async function close(p: Period) {
    const ok = await confirm({
      title: tr("Cerrar {month}", { month: monthName(p.month) }),
      message: tr("No se podrán registrar, cancelar ni editar ventas, compras ni gastos con fecha en ese mes."),
      confirmLabel: tr("Cerrar mes"),
    });
    if (!ok) return;
    try {
      await api("/api/accounting/periods/close", { body: { month: p.month } });
      toast.success(tr("Mes cerrado"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function reopen(p: Period) {
    const reason = await confirm({
      title: tr("Reabrir {month}", { month: monthName(p.month) }),
      message: tr("Queda registrado en la bitácora quién lo reabrió y por qué."),
      inputLabel: tr("Motivo"),
      confirmLabel: tr("Reabrir mes"),
      danger: true,
    });
    if (typeof reason !== "string") return;
    try {
      await api("/api/accounting/periods/reopen", { body: { month: p.month, reason } });
      toast.success(tr("Mes reabierto"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {tr("Cierra el mes cuando tu contador lo haya revisado: así nadie cambia lo que ya se declaró.")}
      </p>
      <ul className="space-y-2">
        {data.map((p) => (
          <li key={p.month}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900 capitalize">{monthName(p.month)}</p>
                  <p className="text-xs text-slate-500">
                    {p.closedAt
                      ? tr("Cerrado el {date}", { date: fmt.date(p.closedAt) })
                      : p.current
                        ? tr("Mes en curso")
                        : tr("Abierto")}
                    {p.reopenedAt && !p.closedAt && ` · ${tr("reabierto el {date}", { date: fmt.date(p.reopenedAt) })}`}
                  </p>
                </div>
                {p.closedAt ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => reopen(p)}
                    aria-label={tr("Reabrir {month}", { month: monthName(p.month) })}
                  >
                    <LockOpen className="w-4 h-4" aria-hidden="true" /> {tr("Reabrir")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => close(p)}
                    aria-label={tr("Cerrar {month}", { month: monthName(p.month) })}
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar mes")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
