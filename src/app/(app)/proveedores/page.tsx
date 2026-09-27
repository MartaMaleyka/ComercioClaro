"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import useSWR from "swr";
import { Pencil, Phone, Plus, Trash2, Truck } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useDebounce } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import type { Supplier } from "@/lib/client/types";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

interface SupplierDetail {
  supplier: Supplier;
  priceHistory: {
    productId: string;
    name: string;
    unit: string;
    prices: { date: string; unitCost: number; folio: number }[];
  }[];
  purchases: { id: string; folio: number; total: number; createdAt: string; status: string }[];
}

const emptyForm = { name: "", contact: "", phone: "", email: "", notes: "", creditDays: "30" };

export default function SuppliersPage() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search);
  const { data, error, mutate } = useSWR<Supplier[]>(`/api/suppliers?search=${encodeURIComponent(debounced)}`, fetcher);
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useSWR<SupplierDetail>(detailId ? `/api/suppliers/${detailId}` : null, fetcher);

  function openForm(s: Supplier | null) {
    setForm(
      s
        ? {
            name: s.name,
            contact: s.contact ?? "",
            phone: s.phone ?? "",
            email: s.email ?? "",
            notes: s.notes ?? "",
            creditDays: String(s.creditDays ?? 30),
          }
        : emptyForm
    );
    setEditing(s);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", {
        method: editing ? "PUT" : "POST",
        body: form,
      });
      toast.success(tr("Proveedor guardado"));
      setEditing(undefined);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function archive(s: Supplier) {
    if (
      !(await confirm({
        title: `Eliminar ${s.name}`,
        message: tr("Sus compras anteriores se conservan."),
        danger: true,
        confirmLabel: tr("Eliminar"),
      }))
    )
      return;
    try {
      await api(`/api/suppliers/${s.id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Proveedores")}
        description={tr("Contactos e historial de precios")}
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus className="w-4 h-4" /> {tr("Proveedor")}
          </Button>
        }
      />
      <SearchBar value={search} onChange={setSearch} placeholder={tr("Buscar proveedor")} />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={tr("Sin proveedores")}
          description={tr("Registra a quién le compras para comparar precios y saber a quién pedir.")}
        />
      ) : (
        <div className="space-y-2">
          {data.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <button onClick={() => setDetailId(s.id)} className="text-left min-w-0">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {[s.contact, s.phone].filter(Boolean).join(" · ")}
                    {s._count && ` · ${s._count.purchases} compras`}
                  </p>
                </button>
                <span className="flex gap-1 shrink-0">
                  {s.phone && (
                    <a
                      href={`tel:${s.phone}`}
                      aria-label={`Llamar a ${s.name}`}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    aria-label={tr("Editar")}
                    onClick={() => openForm(s)}
                    className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    aria-label={tr("Eliminar")}
                    onClick={() => archive(s)}
                    className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? tr("Editar proveedor") : tr("Nuevo proveedor")}
      >
        <form onSubmit={save} className="space-y-3">
          <Input
            label={tr("Nombre")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label={tr("Contacto")}
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={tr("Teléfono")}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label={tr("Correo")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Input
            label={tr("Días de crédito")}
            inputMode="numeric"
            value={form.creditDays}
            onChange={(e) => setForm({ ...form, creditDays: e.target.value })}
            hint={tr("Vencimiento por defecto de sus facturas a crédito")}
          />
          <Textarea
            label={tr("Notas")}
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={tr("Días de visita, condiciones de pago...")}
          />
          <Button type="submit" className="w-full" loading={saving}>
            {tr("Guardar")}
          </Button>
        </form>
      </Modal>

      <Modal open={detailId !== null} onClose={() => setDetailId(null)} title={detail?.supplier.name ?? "Proveedor"}>
        {!detail ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-500">{tr("Historial de precios")}</h3>
            {detail.priceHistory.length === 0 && (
              <p className="text-sm text-slate-500">{tr("Sin compras registradas.")}</p>
            )}
            {detail.priceHistory.map((h) => {
              const [last, prev] = h.prices;
              const change = prev ? ((last.unitCost - prev.unitCost) / prev.unitCost) * 100 : 0;
              return (
                <div key={h.productId} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-900">{h.name}</span>
                    <span>
                      {fmt.money(last.unitCost)}
                      {prev && Math.abs(change) >= 0.5 && (
                        <span className={change > 0 ? "text-red-600" : "text-brand-600"}>
                          {" "}
                          {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {h.prices
                      .slice(0, 5)
                      .map((p) => `${fmt.date(p.date)}: ${fmt.money(p.unitCost)}`)
                      .join(" · ")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
