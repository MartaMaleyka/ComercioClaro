"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { Category, Product } from "@/lib/client/types";
import { describePromotion, isPromotionActive, type PromotionRule } from "@/lib/promotions";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

type Promotion = PromotionRule & {
  product: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
};

const empty = {
  name: "",
  type: "BUY_X_PAY_Y" as PromotionRule["type"],
  target: "product" as "product" | "category",
  productId: "",
  categoryId: "",
  percent: "10",
  buyQty: "2",
  payQty: "1",
  bundleQty: "3",
  bundlePrice: "",
  startsAt: "",
  endsAt: "",
  active: true,
};

export default function PromotionsPage() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Promotion[]>("/api/promotions", fetcher);
  const { data: catalog } = useSWR<{ items: Product[] }>("/api/products?all=true", fetcher);
  const { data: categories } = useSWR<Category[]>("/api/categories", fetcher);
  const [editing, setEditing] = useState<Promotion | null | undefined>(undefined);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  function open(p: Promotion | null) {
    setForm(
      p
        ? {
            name: p.name,
            type: p.type,
            target: p.productId ? "product" : "category",
            productId: p.productId ?? "",
            categoryId: p.categoryId ?? "",
            percent: p.percent != null ? String(Math.round(p.percent * 1000) / 10) : "10",
            buyQty: String(p.buyQty ?? 2),
            payQty: String(p.payQty ?? 1),
            bundleQty: String(p.bundleQty ?? 3),
            bundlePrice: p.bundlePrice != null ? String(p.bundlePrice) : "",
            startsAt: p.startsAt ? String(p.startsAt).slice(0, 10) : "",
            endsAt: p.endsAt ? String(p.endsAt).slice(0, 10) : "",
            active: p.active,
          }
        : empty
    );
    setEditing(p);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        type: form.type,
        productId: form.target === "product" ? form.productId || null : null,
        categoryId: form.target === "category" ? form.categoryId || null : null,
        percent: form.type === "PERCENT" ? Number(form.percent) / 100 : null,
        buyQty: form.type === "BUY_X_PAY_Y" ? Number(form.buyQty) : null,
        payQty: form.type === "BUY_X_PAY_Y" ? Number(form.payQty) : null,
        bundleQty: form.type === "BUNDLE_PRICE" ? Number(form.bundleQty) : null,
        bundlePrice: form.type === "BUNDLE_PRICE" ? Number(form.bundlePrice) : null,
        startsAt: form.startsAt ? `${form.startsAt}T00:00:00` : null,
        endsAt: form.endsAt ? `${form.endsAt}T23:59:59` : null,
        active: form.active,
      };
      await api(editing ? `/api/promotions/${editing.id}` : "/api/promotions", {
        method: editing ? "PUT" : "POST",
        body,
      });
      toast.success(tr("Promoción guardada"));
      setEditing(undefined);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Promotion) {
    if (!(await confirm({ title: `Eliminar ${p.name}`, danger: true, confirmLabel: tr("Eliminar") }))) return;
    try {
      await api(`/api/promotions/${p.id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Promociones")}
        description={tr("2x1, 3 por B/.1, % de descuento. Se aplican solas al vender.")}
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="w-4 h-4" /> {tr("Promoción")}
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={tr("Sin promociones")}
          description={tr(
            "Crea ofertas como 2x1 en cervezas o 10% en limpieza; el punto de venta las aplica automáticamente."
          )}
        />
      ) : (
        <div className="space-y-2">
          {data.map((p) => {
            const live = isPromotionActive(p);
            return (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {describePromotion(p, fmt.money)} · {p.product?.name ?? `Categoría ${p.category?.name ?? ""}`}
                      {p.endsAt && ` · hasta ${fmt.date(p.endsAt as string)}`}
                    </p>
                    <Badge tone={live ? "green" : "gray"} className="mt-1">
                      {live ? tr("Vigente") : p.active ? "Fuera de fecha" : "Pausada"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <button
                      aria-label={tr("Editar")}
                      onClick={() => open(p)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      aria-label={tr("Eliminar")}
                      onClick={() => remove(p)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
        title={editing ? tr("Editar promoción") : tr("Nueva promoción")}
      >
        <form onSubmit={save} className="space-y-3">
          <Input
            label={tr("Nombre")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={tr("2x1 Cerveza Panamá")}
            required
          />
          <Select
            label={tr("Tipo")}
            value={form.type}
            onChange={(e) => set("type", e.target.value as PromotionRule["type"])}
          >
            <option value="BUY_X_PAY_Y">{tr("Lleva X, paga Y (2x1, 3x2)")}</option>
            <option value="BUNDLE_PRICE">{tr("Precio por cantidad (3 por B/.1.00)")}</option>
            <option value="PERCENT">{tr("Porcentaje de descuento")}</option>
          </Select>
          {form.type === "BUY_X_PAY_Y" && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={tr("Lleva")}
                inputMode="numeric"
                value={form.buyQty}
                onChange={(e) => set("buyQty", e.target.value)}
              />
              <Input
                label={tr("Paga")}
                inputMode="numeric"
                value={form.payQty}
                onChange={(e) => set("payQty", e.target.value)}
              />
            </div>
          )}
          {form.type === "BUNDLE_PRICE" && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={tr("Cantidad")}
                inputMode="numeric"
                value={form.bundleQty}
                onChange={(e) => set("bundleQty", e.target.value)}
              />
              <Input
                label={tr("Precio del paquete")}
                inputMode="decimal"
                value={form.bundlePrice}
                onChange={(e) => set("bundlePrice", e.target.value)}
              />
            </div>
          )}
          {form.type === "PERCENT" && (
            <Input
              label={tr("Descuento (%)")}
              inputMode="decimal"
              value={form.percent}
              onChange={(e) => set("percent", e.target.value)}
            />
          )}
          <Select
            label={tr("Aplica a")}
            value={form.target}
            onChange={(e) => set("target", e.target.value as "product" | "category")}
          >
            <option value="product">{tr("Un producto")}</option>
            <option value="category">{tr("Toda una categoría")}</option>
          </Select>
          {form.target === "product" ? (
            <Select
              label={tr("Producto")}
              value={form.productId}
              onChange={(e) => set("productId", e.target.value)}
              required
            >
              <option value="">{tr("Selecciona")}</option>
              {catalog?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              label={tr("Categoría")}
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              required
            >
              <option value="">{tr("Selecciona")}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={tr("Desde (opcional)")}
              type="date"
              value={form.startsAt}
              onChange={(e) => set("startsAt", e.target.value)}
            />
            <Input
              label={tr("Hasta (opcional)")}
              type="date"
              value={form.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </div>
          <Checkbox label={tr("Activa")} checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          <Button type="submit" className="w-full" loading={saving}>
            {tr("Guardar")}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
