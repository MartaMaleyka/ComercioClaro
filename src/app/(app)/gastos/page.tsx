"use client";

import { useText } from "@/lib/client/i18n";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Receipt, Trash2 } from "lucide-react";
import { api, withQuery } from "@/lib/client/api";
import { useDebounce, usePaginated } from "@/lib/client/hooks";
import { useFormat, todayKey } from "@/lib/client/format";
import type { Expense } from "@/lib/client/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, LoadMore, PageHeader, Stat } from "@/components/ui/Misc";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { RecurringTab } from "@/components/expenses/RecurringTab";

const DEFAULT_CATEGORIES = [
  "Renta",
  "Luz",
  "Agua",
  "Gas",
  "Internet / teléfono",
  "Sueldos",
  "Transporte",
  "Mantenimiento",
  "Impuestos",
  "Otros",
];

export default function ExpensesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Expenses />
    </Suspense>
  );
}

function Expenses() {
  const tr = useText();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "recurrentes" ? "recurring" : "expenses";
  const { business } = useSession();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(todayKey(business.timezone, -30));
  const [to, setTo] = useState(todayKey(business.timezone));
  const debounced = useDebounce(search);
  const list = usePaginated<Expense>("/api/expenses", { search: debounced, from, to, limit: 50 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "Renta",
    description: "",
    amount: "",
    paymentMethod: "CASH",
    date: todayKey(business.timezone),
  });
  const [saving, setSaving] = useState(false);

  const firstPage = list.data?.[0] as { categories?: string[] } | undefined;
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...(firstPage?.categories ?? [])])];
  const total = list.items.reduce((acc, e) => acc + e.amount, 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Mediodía local para que la fecha no cambie por zona horaria.
      const date = form.date ? `${form.date}T12:00:00` : null;
      await api("/api/expenses", { body: { ...form, amount: Number(form.amount), date } });
      toast.success(tr("Gasto registrado"));
      setOpen(false);
      setForm((f) => ({ ...f, description: "", amount: "" }));
      list.mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(expense: Expense) {
    if (
      !(await confirm({
        title: tr("Eliminar gasto"),
        message: `${expense.category} · ${fmt.money(expense.amount)}`,
        danger: true,
        confirmLabel: tr("Eliminar"),
      }))
    )
      return;
    try {
      await api(`/api/expenses/${expense.id}`, { method: "DELETE" });
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Gastos")}
        description={tr("Renta, servicios, sueldos... para calcular tu ganancia real")}
        actions={
          <>
            {business.features.includes("export") && (
              <a
                href={withQuery("/api/export/expenses", { from, to })}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> {tr("CSV")}
              </a>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> {tr("Gasto")}
            </Button>
          </>
        }
      />

      {business.features.includes("cashflow") && (
        <Tabs
          label={tr("Gastos")}
          tabs={[
            { value: "expenses", label: tr("Gastos") },
            { value: "recurring", label: tr("Recurrentes") },
          ]}
          value={tab}
          onChange={(v) => router.replace(v === "recurring" ? "/gastos?tab=recurrentes" : "/gastos")}
        />
      )}
      {tab === "recurring" && business.features.includes("cashflow") ? (
        <RecurringTab categories={categories} />
      ) : (
        <>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
            <SearchBar value={search} onChange={setSearch} placeholder={tr("Buscar gasto")} />
            <Input type="date" aria-label={tr("Desde")} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label={tr("Hasta")} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <Stat
            label={tr("Total mostrado")}
            value={fmt.money(total)}
            hint={list.hasMore ? tr("Carga más para ver el total completo") : undefined}
          />

          {list.error ? (
            <ErrorState error={list.error} onRetry={() => list.mutate()} />
          ) : list.isLoading ? (
            <ListSkeleton />
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={tr("Sin gastos")}
              description={tr("Registra renta, luz, sueldos y otros gastos para ver tu ganancia neta.")}
            />
          ) : (
            <div className="space-y-2">
              {list.items.map((e) => (
                <Card key={e.id}>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {e.category} {e.recurringId && <Badge tone="blue">{tr("Recurrente")}</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {fmt.date(e.date)} · {PAYMENT_METHOD_LABELS[e.paymentMethod]}
                        {e.description && ` · ${e.description}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-red-600 tabular-nums">{fmt.money(e.amount)}</p>
                      <button
                        aria-label={tr("Eliminar gasto")}
                        onClick={() => remove(e)}
                        className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={tr("Nuevo gasto")}>
        <form onSubmit={save} className="space-y-3">
          <Select
            label={tr("Categoría")}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={tr("Pagado con")}
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              <option value="CASH">{tr("Efectivo (sale de caja)")}</option>
              <option value="CARD">{tr("Tarjeta")}</option>
              <option value="TRANSFER">{tr("Transferencia")}</option>
              {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
            </Select>
            <Input
              label={tr("Fecha")}
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <Input
            label={tr("Descripción")}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
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
