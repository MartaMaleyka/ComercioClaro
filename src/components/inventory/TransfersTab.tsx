"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowRightLeft, Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import type { Product } from "@/lib/client/types";
import { UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

interface Transfer {
  id: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
  receivedAt: string | null;
  fromBusiness: { id: string; name: string };
  toBusiness: { id: string; name: string };
  lines: { id: string; name: string; unit: string; quantity: number }[];
}

const STATUS = {
  IN_TRANSIT: { label: "En tránsito", tone: "amber" },
  RECEIVED: { label: "Recibido", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
} as const;

/** Traspasos de mercancía entre sucursales del mismo dueño. */
export function TransfersTab() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<Transfer[]>("/api/transfers", fetcher);
  const { data: destinations } = useSWR<{ id: string; name: string }[]>("/api/transfers/destinations", fetcher);
  const [creating, setCreating] = useState(false);

  async function act(t: Transfer, action: "receive" | "cancel") {
    if (action === "cancel") {
      const ok = await confirm({
        title: tr("Cancelar traspaso"),
        message: tr("La mercancía regresa al inventario de esta sucursal."),
        danger: true,
        confirmLabel: tr("Cancelar traspaso"),
      });
      if (!ok) return;
    }
    try {
      await api(`/api/transfers/${t.id}/${action}`, { method: "POST" });
      toast.success(action === "receive" ? tr("Mercancía recibida en el inventario") : tr("Traspaso cancelado"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600">
          {tr("La mercancía sale de esta sucursal al enviarla y entra a la otra cuando la reciben.")}
        </p>
        <Button onClick={() => setCreating(true)} disabled={!destinations || destinations.length === 0}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nuevo traspaso")}
        </Button>
      </div>
      {destinations && destinations.length === 0 && (
        <p className="text-sm text-amber-700">
          {tr("Para enviar mercancía necesitas otra sucursal. Créala en Configuración → Sucursales.")}
        </p>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title={tr("Sin traspasos")}
          description={tr("Mueve mercancía entre sucursales sin perder el costo ni el historial.")}
        />
      ) : (
        <ul className="space-y-3">
          {data.map((t) => {
            const incoming = t.toBusiness.id === business.id;
            return (
              <li key={t.id}>
                <Card>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {incoming
                            ? tr("Desde {name}", { name: t.fromBusiness.name })
                            : tr("Hacia {name}", { name: t.toBusiness.name })}
                        </h3>
                        <p className="text-xs text-slate-500">{fmt.dateTime(t.createdAt)}</p>
                      </div>
                      <Badge tone={STATUS[t.status].tone}>{tr(STATUS[t.status].label)}</Badge>
                    </div>
                    <ul className="text-sm text-slate-700">
                      {t.lines.map((l) => (
                        <li key={l.id}>
                          {fmt.qty(l.quantity, l.unit)} · {l.name}
                        </li>
                      ))}
                    </ul>
                    {t.notes && <p className="text-sm text-slate-500">{t.notes}</p>}
                    {t.status === "IN_TRANSIT" && (
                      <div className="flex gap-2">
                        {incoming ? (
                          <Button size="sm" onClick={() => act(t, "receive")}>
                            {tr("Recibir mercancía")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => act(t, "cancel")}>
                            {tr("Cancelar traspaso")}
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {creating && destinations && (
        <NewTransferModal
          destinations={destinations}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function NewTransferModal({
  destinations,
  onClose,
  onSaved,
}: {
  destinations: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { data: catalog } = useSWR<{ items: Product[] }>("/api/products?all=true", fetcher);
  const [toBusinessId, setToBusinessId] = useState(destinations[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<
    { productId: string; name: string; unit: string; stock: number; quantity: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const products = useMemo(() => (catalog?.items ?? []).filter((p) => p.stock > 0), [catalog]);
  const matches = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode === search).slice(0, 8)
    : [];

  function add(p: Product) {
    setSearch("");
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((l) => [...l, { productId: p.id, name: p.name, unit: p.unit, stock: p.stock, quantity: "1" }]);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/transfers", {
        body: {
          toBusinessId,
          notes: notes || null,
          lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
        },
      });
      toast.success(tr("Traspaso enviado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Nuevo traspaso")} size="lg">
      <form onSubmit={save} className="space-y-4">
        <Select label={tr("Enviar a")} value={toBusinessId} onChange={(e) => setToBusinessId(e.target.value)}>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
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
          <div key={l.productId} className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
            <p className="text-sm font-medium text-slate-900 pb-3">
              {l.name}{" "}
              <span className="font-normal text-slate-500">({tr("hay {qty}", { qty: fmt.qty(l.stock, l.unit) })})</span>
            </p>
            <Input
              label={tr("Cantidad ({unit})", { unit: UNIT_LABELS[l.unit] ?? l.unit })}
              inputMode="decimal"
              required
              value={l.quantity}
              onChange={(e) =>
                setLines((x) => x.map((y) => (y.productId === l.productId ? { ...y, quantity: e.target.value } : y)))
              }
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
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={lines.length === 0 || !toBusinessId}>
            {tr("Enviar mercancía")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
