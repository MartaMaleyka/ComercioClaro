"use client";

import { useText } from "@/lib/client/i18n";
import { useFormat } from "@/lib/client/format";
import { CASH_DENOMINATIONS } from "@/lib/cash";

export type DenominationCounts = Record<string, string>;

const count = (counts: DenominationCounts, value: number) => Math.max(0, Math.floor(Number(counts[value]) || 0));

export function denominationTotal(counts: DenominationCounts) {
  // En centavos para no acumular errores de punto flotante.
  const cents = CASH_DENOMINATIONS.reduce((acc, v) => acc + Math.round(v * 100) * count(counts, v), 0);
  return cents / 100;
}

export function denominationBreakdown(counts: DenominationCounts) {
  return CASH_DENOMINATIONS.map((value) => ({ value, count: count(counts, value) })).filter((d) => d.count > 0);
}

/**
 * Conteo del efectivo por billetes y monedas (dólares y centésimos de balboa). La suma llena el
 * efectivo contado y el detalle queda guardado con el corte.
 */
export function DenominationCount({
  counts,
  onChange,
}: {
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
}) {
  const tr = useText();
  const fmt = useFormat();
  const field = (value: number) => {
    const id = `denom-${String(value).replace(".", "_")}`;
    const n = count(counts, value);
    return (
      <div key={value} className="flex items-center gap-2">
        <label htmlFor={id} className="w-12 text-sm font-medium text-slate-700 tabular-nums">
          {value >= 1 ? `$${value}` : `${Math.round(value * 100)}¢`}
        </label>
        <input
          id={id}
          inputMode="numeric"
          placeholder="0"
          value={counts[value] ?? ""}
          onChange={(e) => onChange({ ...counts, [value]: e.target.value.replace(/\D/g, "") })}
          className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-surface text-sm tabular-nums"
        />
        <span className="text-xs text-slate-500 tabular-nums">{n > 0 ? fmt.money(n * value) : ""}</span>
      </div>
    );
  };
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{tr("Contar por billetes y monedas")}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{tr("Billetes")}</p>
          {CASH_DENOMINATIONS.filter((v) => v >= 1).map(field)}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">{tr("Monedas")}</p>
          {CASH_DENOMINATIONS.filter((v) => v < 1).map(field)}
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-900 tabular-nums" aria-live="polite">
        {tr("Total contado: {amount}", { amount: fmt.money(denominationTotal(counts)) })}
      </p>
    </fieldset>
  );
}
