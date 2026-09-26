"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ClipboardList, MessageCircle, PackageCheck, Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { whatsappLink } from "@/lib/client/receipt";
import type { Product, Supplier } from "@/lib/client/types";
import { UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

type Status = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED";

interface PurchaseOrder {
  id: string;
  folio: number;
  status: Status;
  supplierName: string | null;
  supplier: { id: string; name: string; phone: string | null; contact: string | null } | null;
  notes: string | null;
  expectedAt: string | null;
  total: number;
  createdAt: string;
  lines: {
    id: string;
    quantity: number;
    receivedQuantity: number;
    unitCost: number;
    product: { id: string; name: string; unit: string; packSize: number | null };
  }[];
  purchases: { id: string; folio: number; total: number }[];
}

const STATUS: Record<Status, { label: string; tone: "gray" | "blue" | "amber" | "green" | "red" }> = {
  DRAFT: { label: "Borrador", tone: "gray" },
  SENT: { label: "Enviada", tone: "blue" },
  PARTIAL: { label: "Recibida en parte", tone: "amber" },
  RECEIVED: { label: "Recibida", tone: "green" },
  CANCELLED: { label: "Cancelada", tone: "gray" },
};

/** Órdenes de compra al proveedor: borrador → enviada → recibida (total o en partes). */
export function PurchaseOrdersTab() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = useSession();
  const [scope, setScope] = useState<"open" | "closed">("open");
  const { data, error, mutate } = useSWR<PurchaseOrder[]>(`/api/purchase-orders?scope=${scope}`, fetcher);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  function orderText(o: PurchaseOrder) {
    return [
      tr("Hola{contact}, le escribe {business}. Orden de compra #{folio}:", {
        contact: o.supplier?.contact ? ` ${o.supplier.contact}` : "",
        business: business.name,
        folio: o.folio,
      }),
      "",
      ...o.lines.map((l) => {
        const pack = l.product.packSize && l.product.packSize > 1 ? l.product.packSize : null;
        return pack && l.quantity % pack === 0
          ? `• ${l.quantity / pack} × ${pack} · ${l.product.name}`
          : `• ${fmt.qty(l.quantity, l.product.unit)} · ${l.product.name}`;
      }),
      "",
      o.expectedAt ? tr("Para el {date}.", { date: fmt.date(o.expectedAt) }) : null,
      o.notes,
      tr("¿Me confirma disponibilidad y precio? Gracias."),
    ]
      .filter((l) => l !== null)
      .join("\n");
  }

  async function send(o: PurchaseOrder) {
    try {
      if (o.status === "DRAFT") await api(`/api/purchase-orders/${o.id}/send`, { method: "POST" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function close(o: PurchaseOrder) {
    const partial = o.status === "PARTIAL";
    const ok = await confirm({
      title: tr("Cerrar orden #{folio}", { folio: o.folio }),
      message: partial
        ? tr("Lo que no llegó queda como faltante y la orden se da por recibida.")
        : tr("La orden se cancelará; no se registró ninguna mercancía."),
      danger: !partial,
      confirmLabel: tr("Cerrar orden"),
    });
    if (!ok) return;
    try {
      await api(`/api/purchase-orders/${o.id}/close`, { method: "POST" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs
          label={tr("Órdenes de compra")}
          tabs={[
            { value: "open", label: tr("Abiertas") },
            { value: "closed", label: tr("Cerradas") },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nueva orden")}
        </Button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tr("Sin órdenes de compra")}
          description={tr(
            "Crea una orden desde aquí o desde Inventario → Qué comprar y envíala al proveedor por WhatsApp."
          )}
        />
      ) : (
        <ul className="space-y-3">
          {data.map((o) => {
            const supplierName = o.supplier?.name ?? o.supplierName ?? tr("Sin proveedor");
            const open = ["DRAFT", "SENT", "PARTIAL"].includes(o.status);
            return (
              <li key={o.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {tr("Orden #{folio}", { folio: o.folio })} · {supplierName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {fmt.date(o.createdAt)}
                          {o.expectedAt ? ` · ${tr("Para el {date}.", { date: fmt.date(o.expectedAt) })}` : ""}
                        </p>
                      </div>
                      <Badge tone={STATUS[o.status].tone}>{tr(STATUS[o.status].label)}</Badge>
                    </div>
                    <ul className="text-sm divide-y divide-slate-100">
                      {o.lines.map((l) => (
                        <li key={l.id} className="py-1 flex justify-between gap-2">
                          <span>{l.product.name}</span>
                          <span className="tabular-nums text-slate-600">
                            {fmt.number(l.receivedQuantity)} / {fmt.qty(l.quantity, l.product.unit)} ·{" "}
                            {fmt.money(l.unitCost)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="flex justify-between text-sm">
                      <span className="text-slate-600">{tr("Total estimado")}</span>
                      <span className="font-semibold tabular-nums">{fmt.money(o.total)}</span>
                    </p>
                    {o.purchases.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {tr("Compras registradas:")} {o.purchases.map((p) => `#${p.folio}`).join(", ")}
                      </p>
                    )}
                    {open && (
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={whatsappLink(orderText(o), o.supplier?.phone, business.locale)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => send(o)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 min-h-8 text-sm rounded-lg font-medium bg-surface text-slate-700 border border-slate-200 hover:bg-slate-50"
                        >
                          <MessageCircle className="w-4 h-4" aria-hidden="true" /> {tr("Enviar por WhatsApp")}
                        </a>
                        <Button size="sm" onClick={() => setReceiving(o)}>
                          <PackageCheck className="w-4 h-4" aria-hidden="true" /> {tr("Recibir mercancía")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => close(o)}>
                          {tr("Cerrar orden")}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <NewOrderModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setScope("open");
            mutate();
          }}
        />
      )}
      {receiving && (
        <ReceiveModal
          order={receiving}
          onClose={() => setReceiving(null)}
          onSaved={() => {
            setReceiving(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

interface DraftLine {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  unitCost: string;
}

function NewOrderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { data: catalog } = useSWR<{ items: Product[] }>("/api/products?all=true", fetcher);
  const { data: suppliers } = useSWR<Supplier[]>("/api/suppliers", fetcher);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const products = useMemo(() => catalog?.items ?? [], [catalog]);
  const matches = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode === search).slice(0, 8)
    : [];
  const total = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  function add(p: Product) {
    setSearch("");
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((l) => [
      ...l,
      { productId: p.id, name: p.name, unit: p.unit, quantity: "1", unitCost: String(p.cost ?? "") },
    ]);
  }
  const update = (id: string, patch: Partial<DraftLine>) =>
    setLines((l) => l.map((x) => (x.productId === id ? { ...x, ...patch } : x)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/purchase-orders", {
        body: {
          supplierId: supplierId || null,
          supplierName: supplierId ? null : supplierName || null,
          expectedAt: expectedAt ? `${expectedAt}T12:00:00` : null,
          notes: notes || null,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost === "" ? null : Number(l.unitCost),
          })),
        },
      });
      toast.success(tr("Orden de compra creada"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Nueva orden de compra")} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
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
          <Input
            label={tr("Fecha de entrega")}
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
          />
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
                  type="button"
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
        {lines.map((l) => (
          <div key={l.productId} className="grid grid-cols-[1fr_110px_110px_auto] gap-2 items-end">
            <p className="text-sm font-medium text-slate-900 pb-3">{l.name}</p>
            <Input
              label={tr("Cantidad ({unit})", { unit: UNIT_LABELS[l.unit] ?? l.unit })}
              inputMode="decimal"
              required
              value={l.quantity}
              onChange={(e) => update(l.productId, { quantity: e.target.value })}
            />
            <Input
              label={tr("Costo unitario")}
              inputMode="decimal"
              value={l.unitCost}
              onChange={(e) => update(l.productId, { unitCost: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("Quitar {name}", { name: l.name })}
              onClick={() => setLines((x) => x.filter((y) => y.productId !== l.productId))}
              className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <Input
          label={tr("Notas")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr("Opcional")}
        />
        <div className="flex items-center justify-between">
          <p className="font-bold text-slate-900">
            {tr("Total estimado")}: {fmt.money(total)}
          </p>
          <Button type="submit" loading={saving} disabled={lines.length === 0}>
            {tr("Crear orden")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveModal({ order, onClose, onSaved }: { order: PurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const pendingLines = order.lines.filter((l) => l.receivedQuantity < l.quantity);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      pendingLines.map((l) => [
        l.id,
        {
          quantity: String(Math.round((l.quantity - l.receivedQuantity) * 1000) / 1000),
          unitCost: String(l.unitCost),
          expiresAt: "",
        },
      ])
    )
  );
  const [paidFromCash, setPaidFromCash] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (id: string, patch: Partial<(typeof values)[string]>) =>
    setValues((v) => ({ ...v, [id]: { ...v[id], ...patch } }));
  const total = pendingLines.reduce(
    (acc, l) => acc + (Number(values[l.id].quantity) || 0) * (Number(values[l.id].unitCost) || 0),
    0
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/purchase-orders/${order.id}/receive`, {
        body: {
          paidFromCash,
          notes: notes || null,
          lines: pendingLines.map((l) => ({
            lineId: l.id,
            quantity: Number(values[l.id].quantity) || 0,
            unitCost: values[l.id].unitCost === "" ? null : Number(values[l.id].unitCost),
            lotCode: null,
            expiresAt: values[l.id].expiresAt || null,
          })),
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
    <Modal open onClose={onClose} title={tr("Recibir orden #{folio}", { folio: order.folio })} size="lg">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-600">
          {tr("Escribe lo que realmente llegó. Si falta algo, la orden queda abierta para recibirlo después.")}
        </p>
        {pendingLines.map((l) => (
          <fieldset key={l.id} className="rounded-xl border border-slate-100 p-3 space-y-2">
            <legend className="px-1 text-sm font-medium text-slate-900">
              {l.product.name}{" "}
              <span className="font-normal text-slate-500">
                ({tr("pendiente")}: {fmt.qty(l.quantity - l.receivedQuantity, l.product.unit)})
              </span>
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <Input
                label={tr("Llegó")}
                inputMode="decimal"
                value={values[l.id].quantity}
                onChange={(e) => set(l.id, { quantity: e.target.value })}
              />
              <Input
                label={tr("Costo unitario")}
                inputMode="decimal"
                value={values[l.id].unitCost}
                onChange={(e) => set(l.id, { unitCost: e.target.value })}
              />
              <Input
                label={tr("Caducidad (opc.)")}
                type="date"
                value={values[l.id].expiresAt}
                onChange={(e) => set(l.id, { expiresAt: e.target.value })}
              />
            </div>
          </fieldset>
        ))}
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
          <p className="font-bold text-slate-900">
            {tr("Total:")} {fmt.money(total)}
          </p>
          <Button type="submit" loading={saving}>
            {tr("Registrar compra")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
