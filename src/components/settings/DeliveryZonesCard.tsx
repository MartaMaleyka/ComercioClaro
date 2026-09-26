"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export interface DeliveryZone {
  name: string;
  fee: number;
  productId?: string | null;
}
interface Row {
  key: number;
  name: string;
  fee: string;
  productId: string | null;
}

/**
 * Zonas de entrega con su costo (p. ej. corregimientos de la capital). El catálogo pide la zona
 * y el cargo se cobra como un producto de servicio "Entrega · <zona>".
 */
export function DeliveryZonesCard({ initial }: { initial: DeliveryZone[] }) {
  const tr = useText();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((z, i) => ({ key: i, name: z.name, fee: String(z.fee), productId: z.productId ?? null }))
  );
  const [nextKey, setNextKey] = useState(initial.length);
  const [saving, setSaving] = useState(false);
  const update = (key: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function addRow() {
    setRows((r) => [...r, { key: nextKey, name: "", fee: "", productId: null }]);
    setNextKey((k) => k + 1);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ business: { deliveryZones: DeliveryZone[] | null } }>("/api/business", {
        method: "PUT",
        body: {
          deliveryZones: rows
            .filter((r) => r.name.trim())
            .map((r) => ({
              name: r.name.trim(),
              fee: Number(r.fee.replace(",", ".")) || 0,
              productId: r.productId,
            })),
        },
      });
      const saved = res.business.deliveryZones ?? [];
      setRows(saved.map((z, i) => ({ key: i, name: z.name, fee: String(z.fee), productId: z.productId ?? null })));
      setNextKey(saved.length);
      toast.success(tr("Cambios guardados"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Zonas de entrega")}</h2>
        <p className="text-sm text-slate-500">
          {tr(
            "El catálogo en línea pide la zona y suma su costo. Cada zona se cobra como un servicio en el punto de venta."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
            <Input
              label={tr("Zona o corregimiento")}
              value={r.name}
              maxLength={60}
              onChange={(e) => update(r.key, { name: e.target.value })}
            />
            <Input
              label={tr("Costo")}
              inputMode="decimal"
              value={r.fee}
              onChange={(e) => update(r.key, { fee: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("Quitar {name}", { name: r.name || tr("Zona") })}
              onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
              className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar zona")}
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={save}>
            {tr("Guardar zonas")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
