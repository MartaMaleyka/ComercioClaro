"use client";

import { useState } from "react";
import useSWR from "swr";
import { HandCoins, MessageCircle, Pencil, Plus, Users } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useDebounce } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import { whatsappLink } from "@/lib/client/receipt";
import { countryConfig } from "@/lib/country";
import type { Customer } from "@/lib/client/types";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, ListSkeleton, PageHeader, Stat } from "@/components/ui/Misc";

interface Statement {
  customer: Customer;
  entries: { date: string; type: string; description: string; amount: number; balance: number }[];
  aging: {
    overdue: number;
    daysOverdue: number;
    nextDueDate: string | null;
    pendingSales: {
      id: string;
      folio: number;
      date: string;
      dueDate: string | null;
      pending: number;
      overdue: boolean;
    }[];
  } | null;
}

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  notes: "",
  creditLimit: "0",
  creditDays: "15",
  ruc: "",
  dv: "",
  rfc: "",
  legalName: "",
  taxRegime: "",
  postalCode: "",
};

export default function CustomersPage() {
  const { role, business } = useSession();
  const isOwner = role === "OWNER";
  const country = countryConfig(business.country);
  const fmt = useFormat();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const debounced = useDebounce(search);
  const { data, error, mutate } = useSWR<Customer[]>(
    withQuery("/api/customers", {
      search: debounced,
      withBalance: onlyDebt || undefined,
      overdue: onlyOverdue || undefined,
    }),
    fetcher,
  );
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const statement = useSWR<Statement>(statementId ? `/api/customers/${statementId}` : null, fetcher);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");

  const totalDebt = data?.reduce((acc, c) => acc + c.balance, 0) ?? 0;
  const totalOverdue = data?.reduce((acc, c) => acc + (c.overdue ?? 0), 0) ?? 0;

  function openForm(c: Customer | null) {
    setForm(
      c
        ? {
            name: c.name,
            phone: c.phone ?? "",
            email: c.email ?? "",
            notes: c.notes ?? "",
            creditLimit: String(c.creditLimit),
            creditDays: String(c.creditDays),
            ruc: c.ruc ?? "",
            dv: c.dv ?? "",
            rfc: c.rfc ?? "",
            legalName: c.legalName ?? "",
            taxRegime: c.taxRegime ?? "",
            postalCode: c.postalCode ?? "",
          }
        : emptyForm,
    );
    setEditing(c);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `/api/customers/${editing.id}` : "/api/customers", {
        method: editing ? "PUT" : "POST",
        body: { ...form, creditLimit: Number(form.creditLimit) || 0, creditDays: Number(form.creditDays) || 0 },
      });
      toast.success("Cliente guardado");
      setEditing(undefined);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!statementId) return;
    setSaving(true);
    try {
      await api(`/api/customers/${statementId}/payments`, { body: { amount: Number(payAmount), method: payMethod } });
      toast.success("Abono registrado");
      setPayAmount("");
      statement.mutate();
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  function reminder(c: Customer) {
    const overdue = c.overdue ?? 0;
    const text =
      overdue > 0
        ? `Hola ${c.name}, te saluda ${business.name}. Tienes ${fmt.money(overdue)} vencido${c.daysOverdue ? ` desde hace ${c.daysOverdue} días` : ""} (saldo total ${fmt.money(c.balance)}). ¿Nos ayudas con tu abono? ¡Gracias!`
        : `Hola ${c.name}, te saluda ${business.name}. Te recordamos que tu saldo pendiente es de ${fmt.money(c.balance)}. ¡Gracias!`;
    return whatsappLink(text, c.phone, business.locale);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        description="Cuentas de fiado y datos para factura"
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus className="w-4 h-4" /> Cliente
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total por cobrar" value={fmt.money(totalDebt)} tone={totalDebt > 0 ? "warning" : "default"} />
        <Stat
          label="Vencido"
          value={fmt.money(totalOverdue)}
          tone={totalOverdue > 0 ? "negative" : "default"}
          hint={`${data?.filter((c) => (c.overdue ?? 0) > 0).length ?? 0} clientes`}
        />
        <Stat label="Clientes con saldo" value={data?.filter((c) => c.balance > 0).length ?? 0} />
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre o teléfono" />
        </div>
        <Checkbox label="Solo con saldo" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} />
        <Checkbox label="Solo vencidos" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin clientes"
          description="Registra clientes para venderles fiado y llevar su cuenta."
        />
      ) : (
        <div className="space-y-2">
          {data.map((c) => {
            const usage = c.creditLimit > 0 ? c.balance / c.creditLimit : 0;
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <button onClick={() => setStatementId(c.id)} className="text-left min-w-0">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500">
                      {c.phone ?? "Sin teléfono"}
                      {c.creditLimit > 0 && ` · límite ${fmt.money(c.creditLimit)}`}
                    </p>
                    {business.loyaltyEnabled && (c.points ?? 0) > 0 && (
                      <Badge tone="purple" className="mt-1 mr-1">
                        {c.points} pts
                      </Badge>
                    )}
                    {(c.ruc || c.rfc) && (
                      <Badge tone="blue" className="mt-1">
                        {c.ruc ? `RUC ${c.ruc}${c.dv ? ` DV ${c.dv}` : ""}` : `RFC ${c.rfc}`}
                      </Badge>
                    )}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p
                        className={`font-semibold tabular-nums ${c.balance > 0 ? (usage >= 0.9 ? "text-red-600" : "text-amber-600") : "text-slate-400"}`}
                      >
                        {fmt.money(c.balance)}
                      </p>
                      {(c.overdue ?? 0) > 0 ? (
                        <p className="text-xs text-red-600">
                          {fmt.money(c.overdue)} vencido · {c.daysOverdue} d
                        </p>
                      ) : (
                        c.balance > 0 && (
                          <p className="text-xs text-slate-500">
                            debe{c.nextDueDate ? ` · vence ${fmt.date(c.nextDueDate)}` : ""}
                          </p>
                        )
                      )}
                    </div>
                    {c.balance > 0 && c.phone && (
                      <a
                        href={reminder(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Recordar a ${c.name} por WhatsApp`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                    {isOwner && (
                      <button
                        aria-label="Editar"
                        onClick={() => openForm(c)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? "Editar cliente" : "Nuevo cliente"}
      >
        <form onSubmit={save} className="space-y-3">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Teléfono (WhatsApp)"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="Correo"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {isOwner && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Límite de crédito (fiado)"
                inputMode="decimal"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
                hint="0 = sin límite"
              />
              <Input
                label="Días de crédito"
                inputMode="numeric"
                value={form.creditDays}
                onChange={(e) => setForm({ ...form, creditDays: e.target.value })}
                hint="Plazo para pagar cada venta fiada"
              />
            </div>
          )}
          <Textarea
            label="Notas"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <details className="rounded-xl border border-slate-100 p-3">
            <summary className="text-sm font-medium text-slate-700 cursor-pointer">
              Datos fiscales (para facturar)
            </summary>
            {country.code === "PA" ? (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <Input
                    label="RUC o cédula"
                    value={form.ruc}
                    onChange={(e) => setForm({ ...form, ruc: e.target.value.toUpperCase() })}
                  />
                  <Input
                    label="DV"
                    inputMode="numeric"
                    maxLength={2}
                    value={form.dv}
                    onChange={(e) => setForm({ ...form, dv: e.target.value })}
                  />
                </div>
                <Input
                  label="Razón social"
                  value={form.legalName}
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="RFC"
                    value={form.rfc}
                    onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
                  />
                  <Input
                    label="C.P. fiscal"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  />
                </div>
                <Input
                  label="Razón social (como en su constancia)"
                  value={form.legalName}
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                />
                <Input
                  label="Régimen fiscal (clave SAT)"
                  placeholder="Ej. 612, 626, 601"
                  value={form.taxRegime}
                  onChange={(e) => setForm({ ...form, taxRegime: e.target.value })}
                />
              </div>
            )}
          </details>
          <Button type="submit" className="w-full" loading={saving}>
            Guardar
          </Button>
        </form>
      </Modal>

      <Modal
        open={statementId !== null}
        onClose={() => setStatementId(null)}
        title={statement.data?.customer.name ?? "Estado de cuenta"}
      >
        {!statement.data ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">Saldo pendiente</p>
              <p className="text-2xl font-bold text-slate-900">{fmt.money(statement.data.customer.balance)}</p>
            </div>
            {statement.data.aging && statement.data.aging.pendingSales.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 space-y-1 text-sm">
                <p className="font-medium text-slate-900">
                  Ventas por pagar
                  {statement.data.aging.overdue > 0 && (
                    <span className="text-red-600"> · {fmt.money(statement.data.aging.overdue)} vencido</span>
                  )}
                </p>
                {statement.data.aging.pendingSales.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-slate-600">
                      #{p.folio} · {fmt.date(p.date)}
                      {p.dueDate && ` · vence ${fmt.date(p.dueDate)}`}
                    </span>
                    <span className={p.overdue ? "text-red-600 font-medium" : "text-slate-900"}>
                      {fmt.money(p.pending)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {statement.data.customer.balance > 0 && (
              <form onSubmit={pay} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label="Abono"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                  />
                </div>
                <Select
                  aria-label="Forma de pago"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-auto"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="TRANSFER">Transferencia</option>
                  {business.country === "PA" && <option value="YAPPY">Yappy</option>}
                </Select>
                <Button type="submit" loading={saving}>
                  <HandCoins className="w-4 h-4" /> Abonar
                </Button>
              </form>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 font-medium">Fecha</th>
                    <th className="py-1 font-medium">Concepto</th>
                    <th className="py-1 font-medium text-right">Monto</th>
                    <th className="py-1 font-medium text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...statement.data.entries].reverse().map((e, i) => (
                    <tr key={i}>
                      <td className="py-2 text-xs text-slate-500">{fmt.date(e.date)}</td>
                      <td className="py-2">{e.description}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${e.amount < 0 ? "text-brand-600" : "text-slate-900"}`}
                      >
                        {fmt.money(e.amount)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{fmt.money(e.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {statement.data.entries.length === 0 && <p className="text-sm text-slate-500">Sin movimientos de fiado.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
