import { Prisma } from "@/generated/prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type DecimalLike = Prisma.Decimal | number | string;

export const ZERO = new Decimal(0);

export function D(value: DecimalLike | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value);
}

/** Redondea a centavos (medio hacia arriba). */
export function money(value: DecimalLike): Decimal {
  return D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Redondea cantidades a milésimas (gramos / mililitros). */
export function qty(value: DecimalLike): Decimal {
  return D(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Redondea costos unitarios a 4 decimales. */
export function unitCost(value: DecimalLike): Decimal {
  return D(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0));
}

/**
 * Costo promedio ponderado tras una entrada de mercancía.
 * Las existencias negativas no aportan al promedio.
 */
export function weightedAverageCost(
  currentStock: DecimalLike,
  currentCost: DecimalLike,
  incomingQty: DecimalLike,
  incomingCost: DecimalLike
): Decimal {
  const stock = Decimal.max(D(currentStock), 0);
  const inQty = D(incomingQty);
  const totalQty = stock.plus(inQty);
  if (totalQty.lte(0)) return unitCost(incomingCost);
  return unitCost(stock.times(D(currentCost)).plus(inQty.times(D(incomingCost))).div(totalQty));
}

/**
 * Revierte el costo promedio al cancelar una entrada. Si el resultado no tiene sentido
 * (sin existencias o negativo) se conserva el costo actual.
 */
export function reverseWeightedAverageCost(
  currentStock: DecimalLike,
  currentCost: DecimalLike,
  removedQty: DecimalLike,
  removedCost: DecimalLike
): Decimal {
  const remaining = D(currentStock).minus(D(removedQty));
  if (remaining.lte(0)) return unitCost(currentCost);
  const value = D(currentStock).times(D(currentCost)).minus(D(removedQty).times(D(removedCost)));
  if (value.lt(0)) return unitCost(currentCost);
  return unitCost(value.div(remaining));
}

/** Convierte recursivamente Decimal a number y Date a ISO para respuestas JSON. */
export function serialize<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Decimal.isDecimal(value)) return (value as Decimal).toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
    return out;
  }
  return value;
}

export type Serialized<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
