"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";

type Kind = "RECHARGE" | "BILL" | "OTHER";
interface Provider {
  name: string;
  kind: Kind;
  commissionRate: number;
}
interface Row {
  key: number;
  name: string;
  kind: Kind;
  percent: string;
}

/** Proveedores de recargas y pagos de servicios con la comisión que paga cada uno. */
export function ServiceProvidersCard() {
  const { data } = useSWR<{ providers: Provider[] }>("/api/services", fetcher);
  return data ? <ProvidersEditor initial={data.providers} /> : null;
}

function ProvidersEditor({ initial }: { initial: Provider[] }) {
  const tr = useText();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((p, i) => ({
      key: i,
      name: p.name,
      kind: p.kind,
      percent: String(Math.round(p.commissionRate * 10000) / 100),
    }))
  );
  const [nextKey, setNextKey] = useState(initial.length);
  const [saving, setSaving] = useState(false);
  const update = (key: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function addRow() {
    setRows((r) => [...r, { key: nextKey, name: "", kind: "RECHARGE", percent: "0" }]);
    setNextKey((k) => k + 1);
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/business", {
        method: "PUT",
        body: {
          serviceProviders: rows
            .filter((r) => r.name.trim())
            .map((r) => ({ name: r.name.trim(), kind: r.kind, commissionRate: (Number(r.percent) || 0) / 100 })),
        },
      });
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
        <h2 className="font-semibold text-slate-900">{tr("Recargas y servicios")}</h2>
        <p className="text-sm text-slate-500">
          {tr("Proveedores que cobras en la tienda y la comisión que te paga cada uno por cobro.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_150px_100px_auto] gap-2 items-end">
            <Input label={tr("Proveedor")} value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
            <Select label={tr("Tipo")} value={r.kind} onChange={(e) => update(r.key, { kind: e.target.value as Kind })}>
              <option value="RECHARGE">{tr("Recarga")}</option>
              <option value="BILL">{tr("Pago de servicio")}</option>
              <option value="OTHER">{tr("Otro")}</option>
            </Select>
            <Input
              label={tr("Comisión (%)")}
              inputMode="decimal"
              value={r.percent}
              onChange={(e) => update(r.key, { percent: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("Quitar {name}", { name: r.name || tr("Proveedor") })}
              onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
              className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar proveedor")}
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={save}>
            {tr("Guardar proveedores")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
