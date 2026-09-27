"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFormat } from "@/lib/client/format";
import { useT, useText } from "@/lib/client/i18n";
import type { PaymentMethod } from "@/lib/client/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export interface SplitRow {
  key: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
  giftCardCode: string;
}

const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function newSplitRow(method: PaymentMethod, amount = ""): SplitRow {
  return { key: crypto.randomUUID().slice(0, 8), method, amount, reference: "", giftCardCode: "" };
}

/**
 * Estado del pago dividido (misma regla que el servidor): lo que no es efectivo no puede pasar
 * del total y el efectivo cubre lo que falta; el cambio sale solo del efectivo.
 */
export function splitStatus(rows: SplitRow[], total: number) {
  const nonCash = round2(rows.filter((r) => r.method !== "CASH").reduce((acc, r) => acc + num(r.amount), 0));
  const cashRow = rows.find((r) => r.method === "CASH");
  const cash = cashRow ? round2(num(cashRow.amount)) : 0;
  const pending = round2(total - nonCash);
  const missing = round2(Math.max(0, pending - cash));
  const change = cashRow && pending > 0 ? round2(Math.max(0, cash - pending)) : 0;
  const duplicated = new Set(rows.map((r) => r.method)).size !== rows.length;
  const empty = rows.some((r) => num(r.amount) <= 0);
  const exceeds = nonCash > total || (Boolean(cashRow) && pending <= 0);
  const valid = rows.length > 0 && !duplicated && !empty && !exceeds && missing === 0;
  return {
    nonCash,
    cash,
    missing,
    change,
    valid,
    exceeds,
    duplicated,
    credit: round2(rows.filter((r) => r.method === "CREDIT").reduce((acc, r) => acc + num(r.amount), 0)),
  };
}

/** Cuerpo de `payments` para la API. */
export function splitPayload(rows: SplitRow[]) {
  return rows.map((r) => ({
    method: r.method,
    amount: num(r.amount),
    reference: r.method === "CARD" || r.method === "TRANSFER" || r.method === "YAPPY" ? r.reference || null : null,
    giftCardCode: r.method === "GIFT_CARD" ? r.giftCardCode.trim() || null : null,
  }));
}

/** Renglones de forma de pago y monto, con lo que falta por cubrir. */
export function SplitPayment({
  rows,
  onChange,
  total,
  methods,
  online,
}: {
  rows: SplitRow[];
  onChange: (rows: SplitRow[]) => void;
  total: number;
  methods: PaymentMethod[];
  online: boolean;
}) {
  const tr = useText();
  const t = useT();
  const fmt = useFormat();
  const status = splitStatus(rows, total);
  const set = (key: string, patch: Partial<SplitRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const unused = methods.filter((m) => !rows.some((r) => r.method === m));

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
      <legend className="text-sm font-medium text-slate-700 px-1">{tr("Pago dividido")}</legend>
      {rows.map((row, i) => (
        <div key={row.key} className="space-y-2">
          <div className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
            <Select
              label={tr("Forma de pago {n}", { n: i + 1 })}
              value={row.method}
              onChange={(e) => set(row.key, { method: e.target.value as PaymentMethod })}
            >
              {methods
                .filter((m) => m === row.method || !rows.some((r) => r.method === m))
                .map((m) => (
                  <option key={m} value={m}>
                    {t(`pay.${m}`)}
                  </option>
                ))}
            </Select>
            <Input
              label={row.method === "CASH" ? tr("Recibido") : tr("Monto")}
              inputMode="decimal"
              value={row.amount}
              onChange={(e) => set(row.key, { amount: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("Quitar {name}", { name: t(`pay.${row.method}`) })}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              disabled={rows.length <= 1}
              className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {(row.method === "CARD" || row.method === "TRANSFER" || row.method === "YAPPY") && (
            <Input
              label={tr("Referencia de {method}", { method: t(`pay.${row.method}`) })}
              value={row.reference}
              onChange={(e) => set(row.key, { reference: e.target.value })}
              placeholder={tr("Opcional")}
            />
          )}
          {row.method === "GIFT_CARD" && (
            <Input
              label={tr("Código del vale")}
              inputMode="numeric"
              value={row.giftCardCode}
              onChange={(e) => set(row.key, { giftCardCode: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {unused.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange([...rows, newSplitRow(unused[0], status.missing > 0 ? String(status.missing) : "")])
            }
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar forma de pago")}
          </Button>
        )}
        <p
          role="status"
          className={cn(
            "text-sm font-semibold tabular-nums",
            status.missing > 0 || status.exceeds ? "text-red-600" : "text-brand-600"
          )}
        >
          {status.exceeds
            ? tr("Los pagos exceden el total")
            : status.missing > 0
              ? tr("Falta por cubrir {amount}", { amount: fmt.money(status.missing) })
              : status.change > 0
                ? tr("Cambio {amount}", { amount: fmt.money(status.change) })
                : tr("Total cubierto")}
        </p>
      </div>
      {rows.some((r) => r.method === "GIFT_CARD") && !online && (
        <p className="text-sm text-amber-700">{tr("Para cobrar con vale necesitas conexión.")}</p>
      )}
    </fieldset>
  );
}
