"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Download, Plus, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useDebounce, usePaginated } from "@/lib/client/hooks";
import { useFormat, todayKey } from "@/lib/client/format";
import type { Product, Purchase, Supplier } from "@/lib/client/types";
import { UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ErrorState, ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

interface Line {
  productId: string;
  name: string;
  unit: string;
  trackExpiry: boolean;
  quantity: string;
  unitCost: string;
  lotCode: string;
  expiresAt: string;
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Purchases />
    </Suspense>
  );
}

function Purchases() {
  const { business } = useSession();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(todayKey(business.timezone, -60));
  const [to, setTo] = useState(todayKey(business.timezone));
  const debounced = useDebounce(search);
  const list = usePaginated<Purchase>("/api/purchases", { search: debounced, from, to });
  const [open, setOpen] = useState(() => params.get("nueva") === "1");

  async function cancel(p: Purchase) {
    const reason = await confirm({
      title: `Cancelar compra #${p.folio}`,
      message: "Se retirará la mercancía del inventario. Si ya se vendió, no se podrá cancelar.",
      inputLabel: "Motivo",
      danger: true,
      confirmLabel: "Cancelar compra",
    });
    if (typeof reason !== "string") return;
    try {
      await api(`/api/purchases/${p.id}/cancel`, { body: { reason } });
      toast.success("Compra cancelada");
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras"
        description="Mercancía que entra al inventario"
        actions={
          <>
            <a
              href={withQuery("/api/export/purchases", { from, to })}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> CSV
            </a>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> Nueva compra
            </Button>
          </>
        }
      />

      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por proveedor o producto" />
        <Input type="date" aria-label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.mutate()} />
      ) : list.isLoading ? (
        <ListSkeleton />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Sin compras"
          description="Registra la mercancía que compras para actualizar existencias y costos."
        />
      ) : (
        <div className="space-y-3">
          {list.items.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-2">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      #{p.folio} · {p.supplier?.name ?? p.supplierName ?? "Sin proveedor"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmt.dateTime(p.createdAt)}
                      {p.paidFromCash && " · pagada de caja"}
                    </p>
                    {p.status === "CANCELLED" && (
                      <Badge tone="red" className="mt-1">
                        Cancelada: {p.cancelReason}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold tabular-nums ${p.status === "CANCELLED" ? "line-through text-slate-400" : "text-slate-900"}`}
                    >
                      {fmt.money(p.total)}
                    </p>
                    {p.status === "ACTIVE" && (
                      <button
                        onClick={() => cancel(p)}
                        className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
                <ul className="text-sm text-slate-600 space-y-0.5">
                  {p.items.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <span>
                        {fmt.qty(i.quantity, i.product.unit)} {i.product.name} × {fmt.money(i.unitCost)}
                        {i.expiresAt && <span className="text-xs text-slate-500"> · cad. {fmt.date(i.expiresAt)}</span>}
                      </span>
                      <span className="tabular-nums">{fmt.money(i.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}

      {open && (
        <PurchaseForm
          open={open}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            list.mutate();
          }}
        />
      )}
    </div>
  );
}

function PurchaseForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const fmt = useFormat();
  const toast = useToast();
  const { data: catalog } = useSWR<{ items: Product[] }>(open ? "/api/products?all=true" : null, fetcher);
  const { data: suppliers } = useSWR<Supplier[]>(open ? "/api/suppliers" : null, fetcher);
  const { data: reorder } = useSWR<{ productId: string; suggestedQuantity: number }[]>(
    open ? "/api/inventory/reorder" : null,
    fetcher,
  );
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [paidFromCash, setPaidFromCash] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const products = useMemo(() => catalog?.items ?? [], [catalog]);
  const matches = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode === search).slice(0, 8)
    : [];

  function add(p: Product, quantity = "1") {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((l) => [
      ...l,
      {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        trackExpiry: p.trackExpiry,
        quantity,
        unitCost: String(p.cost ?? ""),
        lotCode: "",
        expiresAt: "",
      },
    ]);
    setSearch("");
  }

  function addSuggestions() {
    reorder?.forEach((s) => {
      const p = products.find((x) => x.id === s.productId);
      if (p) add(p, String(s.suggestedQuantity));
    });
  }

  const update = (id: string, patch: Partial<Line>) =>
    setLines((l) => l.map((x) => (x.productId === id ? { ...x, ...patch } : x)));
  const total = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  async function save() {
    setSaving(true);
    try {
      await api("/api/purchases", {
        body: {
          supplierId: supplierId || null,
          supplierName: supplierId ? null : supplierName || null,
          notes: notes || null,
          paidFromCash,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost === "" ? null : Number(l.unitCost),
            lotCode: l.lotCode || null,
            expiresAt: l.expiresAt || null,
          })),
        },
      });
      toast.success("Compra registrada; inventario y costos actualizados");
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva compra" size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Otro / sin registrar</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {!supplierId && (
            <Input
              label="Nombre del proveedor"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Opcional"
            />
          )}
        </div>

        <div className="relative">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Agregar producto (nombre o código)"
            onEnter={() => matches[0] && add(matches[0])}
          />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex justify-between"
                >
                  <span>{p.name}</span>
                  <span className="text-slate-500">{fmt.qty(p.stock, p.unit)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {reorder && reorder.length > 0 && lines.length === 0 && (
          <button onClick={addSuggestions} className="text-sm text-brand-700 dark:text-brand-300 underline">
            Agregar las {reorder.length} sugerencias de reabastecimiento
          </button>
        )}

        {lines.length > 0 && (
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.productId} className="rounded-xl border border-slate-100 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-medium text-sm text-slate-900">{l.name}</p>
                  <button
                    aria-label={`Quitar ${l.name}`}
                    onClick={() => setLines((x) => x.filter((y) => y.productId !== l.productId))}
                    className="p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    label={`Cantidad (${UNIT_LABELS[l.unit]})`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => update(l.productId, { quantity: e.target.value })}
                  />
                  <Input
                    label="Costo unitario"
                    inputMode="decimal"
                    value={l.unitCost}
                    onChange={(e) => update(l.productId, { unitCost: e.target.value })}
                  />
                  <Input
                    label="Lote"
                    value={l.lotCode}
                    onChange={(e) => update(l.productId, { lotCode: e.target.value })}
                    placeholder="Opcional"
                  />
                  <Input
                    label={l.trackExpiry ? "Caducidad" : "Caducidad (opc.)"}
                    type="date"
                    value={l.expiresAt}
                    onChange={(e) => update(l.productId, { expiresAt: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <Input
          label="Notas"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Número de factura, condiciones..."
        />
        <Checkbox
          label="Se pagó con dinero de la caja"
          checked={paidFromCash}
          onChange={(e) => setPaidFromCash(e.target.checked)}
        />

        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-slate-900">Total: {fmt.money(total)}</p>
          <Button onClick={save} loading={saving} disabled={lines.length === 0}>
            Registrar compra
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          El costo de cada producto se actualiza con el promedio ponderado de lo que ya tenías y lo que entra.
        </p>
      </div>
    </Modal>
  );
}
