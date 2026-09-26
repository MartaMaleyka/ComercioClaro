"use client";

import { useText } from "@/lib/client/i18n";
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
import { Tabs } from "@/components/ui/Tabs";
import { PurchaseOrdersTab } from "@/components/purchases/PurchaseOrdersTab";

interface Line {
  productId: string;
  name: string;
  unit: string;
  trackExpiry: boolean;
  /** Unidades por caja; con byPack la cantidad y el costo se capturan por caja */
  packSize: number | null;
  byPack: boolean;
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
  const tr = useText();
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
  const [tab, setTab] = useState<"purchases" | "orders">(() =>
    params.get("tab") === "ordenes" ? "orders" : "purchases"
  );

  async function cancel(p: Purchase) {
    const reason = await confirm({
      title: tr("Cancelar compra #{folio}", { folio: p.folio }),
      message: tr("Se retirará la mercancía del inventario. Si ya se vendió, no se podrá cancelar."),
      inputLabel: tr("Motivo"),
      danger: true,
      confirmLabel: tr("Cancelar compra"),
    });
    if (typeof reason !== "string") return;
    try {
      await api(`/api/purchases/${p.id}/cancel`, { body: { reason } });
      toast.success(tr("Compra cancelada"));
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Compras")}
        description={tr("Mercancía que entra al inventario")}
        actions={
          <>
            <a
              href={withQuery("/api/export/purchases", { from, to })}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> {tr("CSV")}
            </a>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4" /> {tr("Nueva compra")}
            </Button>
          </>
        }
      />

      <Tabs
        label={tr("Compras")}
        tabs={[
          { value: "purchases", label: tr("Compras") },
          { value: "orders", label: tr("Órdenes de compra") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "orders" ? (
        <PurchaseOrdersTab />
      ) : (
        <>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
            <SearchBar value={search} onChange={setSearch} placeholder={tr("Buscar por proveedor o producto")} />
            <Input type="date" aria-label={tr("Desde")} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label={tr("Hasta")} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          {list.error ? (
            <ErrorState error={list.error} onRetry={() => list.mutate()} />
          ) : list.isLoading ? (
            <ListSkeleton />
          ) : list.items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title={tr("Sin compras")}
              description={tr("Registra la mercancía que compras para actualizar existencias y costos.")}
            />
          ) : (
            <div className="space-y-3">
              {list.items.map((p) => (
                <Card key={p.id}>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          #{p.folio} · {p.supplier?.name ?? p.supplierName ?? tr("Sin proveedor")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fmt.dateTime(p.createdAt)}
                          {p.paidFromCash && ` · ${tr("pagada de caja")}`}
                        </p>
                        {p.status === "CANCELLED" && (
                          <Badge tone="red" className="mt-1">
                            {tr("Cancelada:")} {p.cancelReason}
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
                            <XCircle className="w-3 h-3" /> {tr("Cancelar")}
                          </button>
                        )}
                      </div>
                    </div>
                    <ul className="text-sm text-slate-600 space-y-0.5">
                      {p.items.map((i) => (
                        <li key={i.id} className="flex justify-between">
                          <span>
                            {fmt.qty(i.quantity, i.product.unit)} {i.product.name} × {fmt.money(i.unitCost)}
                            {i.expiresAt && (
                              <span className="text-xs text-slate-500">
                                {" "}
                                {tr("· cad.")} {fmt.date(i.expiresAt)}
                              </span>
                            )}
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
        </>
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
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { data: catalog } = useSWR<{ items: Product[] }>(open ? "/api/products?all=true" : null, fetcher);
  const { data: suppliers } = useSWR<Supplier[]>(open ? "/api/suppliers" : null, fetcher);
  const { data: reorder } = useSWR<{ productId: string; suggestedQuantity: number }[]>(
    open ? "/api/inventory/reorder" : null,
    fetcher
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
        packSize: p.packSize,
        byPack: false,
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

  function togglePack(l: Line) {
    if (!l.packSize) return;
    const q = Number(l.quantity) || 0;
    const c = Number(l.unitCost) || 0;
    const round = (n: number, d: number) => String(Math.round(n * 10 ** d) / 10 ** d);
    update(
      l.productId,
      l.byPack
        ? { byPack: false, quantity: round(q * l.packSize, 3), unitCost: round(c / l.packSize, 4) }
        : { byPack: true, quantity: round(q / l.packSize, 3), unitCost: round(c * l.packSize, 2) }
    );
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
          items: lines.map((l) => {
            // Compra por caja: se convierte a unidades y costo unitario.
            const factor = l.byPack && l.packSize ? l.packSize : 1;
            return {
              productId: l.productId,
              quantity: Number(l.quantity) * factor,
              unitCost: l.unitCost === "" ? null : Math.round((Number(l.unitCost) / factor) * 10000) / 10000,
              lotCode: l.lotCode || null,
              expiresAt: l.expiresAt || null,
            };
          }),
        },
      });
      toast.success(tr("Compra registrada; inventario y costos actualizados"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr("Nueva compra")} size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
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
              placeholder={tr("Opcional")}
            />
          )}
        </div>

        <div className="relative">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={tr("Agregar producto (nombre o código)")}
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
            {tr("Agregar las {n} sugerencias de reabastecimiento", { n: reorder.length })}
          </button>
        )}

        {lines.length > 0 && (
          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.productId} className="rounded-xl border border-slate-100 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm text-slate-900">{l.name}</p>
                    {l.packSize && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 mt-0.5">
                        <input
                          type="checkbox"
                          checked={l.byPack}
                          onChange={() => togglePack(l)}
                          className="accent-brand-600"
                        />
                        {tr("Comprar por caja de")} {l.packSize}
                        {l.byPack &&
                          Number(l.quantity) > 0 &&
                          ` (= ${Number(l.quantity) * l.packSize} ${UNIT_LABELS[l.unit]})`}
                      </label>
                    )}
                  </div>
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
                    label={l.byPack ? tr("Cajas") : `Cantidad (${UNIT_LABELS[l.unit]})`}
                    inputMode="decimal"
                    value={l.quantity}
                    onChange={(e) => update(l.productId, { quantity: e.target.value })}
                  />
                  <Input
                    label={l.byPack ? tr("Costo por caja") : tr("Costo unitario")}
                    inputMode="decimal"
                    value={l.unitCost}
                    onChange={(e) => update(l.productId, { unitCost: e.target.value })}
                  />
                  <Input
                    label={tr("Lote")}
                    value={l.lotCode}
                    onChange={(e) => update(l.productId, { lotCode: e.target.value })}
                    placeholder={tr("Opcional")}
                  />
                  <Input
                    label={l.trackExpiry ? tr("Caducidad") : tr("Caducidad (opc.)")}
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
          label={tr("Notas")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr("Número de factura, condiciones...")}
        />
        <Checkbox
          label={tr("Se pagó con dinero de la caja")}
          checked={paidFromCash}
          onChange={(e) => setPaidFromCash(e.target.checked)}
        />

        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-slate-900">
            {tr("Total:")} {fmt.money(total)}
          </p>
          <Button onClick={save} loading={saving} disabled={lines.length === 0}>
            {tr("Registrar compra")}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {tr("El costo de cada producto se actualiza con el promedio ponderado de lo que ya tenías y lo que entra.")}
        </p>
      </div>
    </Modal>
  );
}
