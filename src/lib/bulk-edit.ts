/**
 * Edición masiva de productos: cálculos que se ven en la tabla antes de guardar.
 * Es código puro para que se pruebe sin navegador.
 */

export const ADJUST_OPS = ["up%", "down%", "add", "sub", "set"] as const;
export type AdjustOp = (typeof ADJUST_OPS)[number];

export const ROUNDINGS = ["none", "0.05", "0.10", "0.25", "0.50", "1", "99"] as const;
export type Rounding = (typeof ROUNDINGS)[number];

/** Columnas de la tabla que aceptan un ajuste en lote. */
export const BULK_EDIT_NUMBERS = ["price", "cost", "wholesalePrice", "minStock"] as const;
export type BulkEditNumber = (typeof BULK_EDIT_NUMBERS)[number];

/** Lee lo que se escribe en una celda: acepta "$", "B/." y separador de miles. Vacío o inválido → null. */
export function cellNumber(value: string): number | null {
  const clean = value.replace(/B\/\.|\$|,|\s/g, "");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Redondea un precio: al múltiplo más cercano o para que termine en .99. */
export function roundPrice(value: number, rounding: Rounding): number {
  if (rounding === "none") return cents(value);
  if (rounding === "99") return value <= 0.99 ? 0.99 : cents(Math.ceil(value) - 0.01);
  const step = Number(rounding);
  return cents(Math.round(value / step) * step);
}

/** Aplica el ajuste elegido a un valor; nunca deja un número negativo. */
export function adjustValue(value: number, op: AdjustOp, amount: number, rounding: Rounding = "none"): number {
  const next =
    op === "up%"
      ? value * (1 + amount / 100)
      : op === "down%"
        ? value * (1 - amount / 100)
        : op === "add"
          ? value + amount
          : op === "sub"
            ? value - amount
            : amount;
  return Math.max(0, roundPrice(next, rounding));
}

/** Margen sobre el precio de venta, en porcentaje; null si no se puede calcular. */
export function marginPercent(price: number | null, cost: number | null): number | null {
  if (price == null || cost == null || price <= 0) return null;
  return Math.round(((price - cost) / price) * 1000) / 10;
}
