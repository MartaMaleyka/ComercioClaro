"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { Product } from "@/lib/client/types";
import { ADJUSTMENT_REASON_LABELS } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface AdjustProps {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AdjustStockModal({ product, ...rest }: AdjustProps) {
  return product ? <AdjustDialog key={product.id} product={product} {...rest} /> : null;
}

function AdjustDialog({ product, onClose, onSaved }: AdjustProps & { product: Product }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [quantity, setQuantity] = useState(String(product.stock));
  const [reason, setReason] = useState("COUNT");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const q = Number(quantity);
  const delta = mode === "set" ? q - product.stock : reason === "COUNT" ? q : -Math.abs(q);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/products/${product.id}/adjust`, {
        body: { mode, quantity: mode === "set" ? q : delta, reason, notes: notes || null },
      });
      toast.success(tr("Existencia ajustada"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Ajustar: ${product.name}`}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-600">
          {tr("Existencia actual:")} {fmt.qty(product.stock, product.unit)}
        </p>
        <Select
          label={tr("Motivo")}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (e.target.value !== "COUNT") {
              setMode("delta");
              setQuantity("");
            } else {
              setMode("set");
              setQuantity(String(product.stock));
            }
          }}
        >
          {Object.entries(ADJUSTMENT_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {tr(label)}
            </option>
          ))}
        </Select>
        <Input
          label={mode === "set" ? tr("Existencia contada") : tr("Cantidad que se da de baja")}
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          autoFocus
        />
        <Input
          label={tr("Notas")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={tr("Opcional")}
        />
        {Number.isFinite(delta) && delta !== 0 && (
          <p className={`text-sm font-medium ${delta < 0 ? "text-red-600" : "text-brand-600"}`}>
            {delta > 0 ? "+" : ""}
            {fmt.number(delta)} {tr("→ quedará en")} {fmt.qty(product.stock + delta, product.unit)}
          </p>
        )}
        <Button type="submit" className="w-full" loading={saving} disabled={!Number.isFinite(delta) || delta === 0}>
          {tr("Guardar ajuste")}
        </Button>
      </form>
    </Modal>
  );
}
