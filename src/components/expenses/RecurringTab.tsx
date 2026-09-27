"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { PAYMENT_METHOD_LABELS } from "@/lib/utils";
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

interface Recurring {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  dayOfMonth: number;
  paymentMethod: string;
  active: boolean;
  lastGenerated: string | null;
}

/** Gastos fijos que se registran solos cada mes (renta, luz, internet). */
export function RecurringTab({ categories }: { categories: string[] }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Recurring[]>("/api/recurring-expenses", fetcher);
  const [editing, setEditing] = useState<Recurring | null | undefined>(undefined);

  async function remove(r: Recurring) {
    const ok = await confirm({
      title: tr("Eliminar gasto recurrente"),
      message: tr("Dejará de registrarse cada mes. Los gastos ya registrados se conservan."),
      confirmLabel: tr("Eliminar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/recurring-expenses/${r.id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  const monthly = data.filter((r) => r.active).reduce((acc, r) => acc + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Stat
          label={tr("Gastos fijos al mes")}
          value={fmt.money(monthly)}
          hint={tr("Se usan en el flujo de caja y el punto de equilibrio")}
        />
        <Button onClick={() => setEditing(null)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Gasto recurrente")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={tr("Sin gastos recurrentes")}
          description={tr("Registra la renta, la luz o el internet una vez y se anotarán solos cada mes en su día.")}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {r.category} {!r.active && <Badge tone="gray">{tr("Pausado")}</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tr("Cada mes el día {n}", { n: r.dayOfMonth })} · {tr(PAYMENT_METHOD_LABELS[r.paymentMethod])}
                      {r.description && ` · ${r.description}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-red-600 tabular-nums mr-2">{fmt.money(r.amount)}</p>
                    <button
                      aria-label={tr("Editar {name}", { name: r.category })}
                      onClick={() => setEditing(r)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={tr("Eliminar {name}", { name: r.category })}
                      onClick={() => remove(r)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && (
        <RecurringForm
          recurring={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function RecurringForm({
  recurring,
  categories,
  onClose,
  onSaved,
}: {
  recurring: Recurring | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const { business } = useSession();
  const [form, setForm] = useState({
    category: recurring?.category ?? categories[0] ?? "Renta",
    description: recurring?.description ?? "",
    amount: recurring ? String(recurring.amount) : "",
    dayOfMonth: recurring ? String(recurring.dayOfMonth) : "1",
    paymentMethod: recurring?.paymentMethod ?? "TRANSFER",
    active: recurring?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(recurring ? `/api/recurring-expenses/${recurring.id}` : "/api/recurring-expenses", {
        method: recurring ? "PUT" : "POST",
        body: { ...form, description: form.description || null },
      });
      toast.success(tr("Gasto recurrente guardado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={recurring ? tr("Editar gasto recurrente") : tr("Nuevo gasto recurrente")}>
      <form onSubmit={save} className="space-y-3">
        <Select
          label={tr("Categoría")}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {[...new Set([form.category, ...categories])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <Input
            label={tr("Día del mes")}
            inputMode="numeric"
            value={form.dayOfMonth}
            onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
            hint={tr("29, 30 y 31 caen el último día en meses más cortos")}
            required
          />
        </div>
        <Select
          label={tr("Pagado con")}
          value={form.paymentMethod}
          onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
        >
          <option value="TRANSFER">{tr("Transferencia")}</option>
          <option value="CASH">{tr("Efectivo")}</option>
          <option value="CARD">{tr("Tarjeta")}</option>
          {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
        </Select>
        <Input
          label={tr("Descripción")}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={tr("Opcional")}
        />
        <Checkbox
          label={tr("Activo: se registra cada mes")}
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Guardar")}
        </Button>
      </form>
    </Modal>
  );
}
