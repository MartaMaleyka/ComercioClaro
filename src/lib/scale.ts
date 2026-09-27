/**
 * Balanza y etiquetas de peso. Sin dependencias del navegador: se usa en el punto de venta
 * y en las pruebas.
 */
import { isValidEan13 } from "./barcode";

export type WeightUnit = "KG" | "G" | "LB" | "OZ";

const TO_KG: Record<WeightUnit, number> = { KG: 1, G: 0.001, LB: 0.45359237, OZ: 0.028349523125 };

export const isWeightUnit = (unit: string): unit is WeightUnit => unit in TO_KG;

/** Convierte un peso entre unidades y lo redondea a milésimas. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit) {
  return Math.round(((value * TO_KG[from]) / TO_KG[to]) * 1000) / 1000;
}

const UNIT_ALIASES: Record<string, WeightUnit> = { kg: "KG", g: "G", gr: "G", lb: "LB", lbs: "LB", oz: "OZ" };

/**
 * Lee una línea de la balanza. Reconoce los formatos comunes: "ST,GS,+  1.234kg",
 * "\x02 001.25 lb", "US,GS, 0.500 kg" (US = inestable) o solo el número.
 */
export function parseScaleReading(line: string): { weight: number; unit: WeightUnit | null; stable: boolean } | null {
  const text = line.replace(/[\x00-\x1f]/g, " ").trim();
  const match = text.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|gr|g|lbs|lb|oz)?\b/i);
  if (!match) return null;
  const weight = Number(match[1].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(weight)) return null;
  const unit = match[2] ? UNIT_ALIASES[match[2].toLowerCase()] : null;
  // Muchas balanzas marcan la lectura inestable con "US" o "?" y la estable con "ST".
  const stable = !/\bUS\b|\?/i.test(text);
  return { weight, unit, stable };
}

export interface WeightBarcodeFormat {
  /** Si se reconocen las etiquetas de peso al escanear */
  enabled: boolean;
  /** WEIGHT = el código trae el peso; PRICE = trae el precio */
  valueType: "WEIGHT" | "PRICE";
  /** Dígitos del código del producto (PLU) después del prefijo */
  pluDigits: 4 | 5 | 6;
  /** Decimales del valor (3 = milésimas de kg o lb; 2 = centavos) */
  decimals: number;
  /** Unidad del peso impreso en la etiqueta */
  weightUnit: WeightUnit;
}

export function defaultWeightBarcode(country: string): WeightBarcodeFormat {
  return { enabled: true, valueType: "WEIGHT", pluDigits: 5, decimals: 3, weightUnit: country === "PA" ? "LB" : "KG" };
}

export function weightBarcodeFormat(value: unknown, country: string): WeightBarcodeFormat {
  const base = defaultWeightBarcode(country);
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<WeightBarcodeFormat>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : base.enabled,
    valueType: v.valueType === "PRICE" ? "PRICE" : "WEIGHT",
    pluDigits: v.pluDigits === 4 || v.pluDigits === 6 ? v.pluDigits : 5,
    decimals: typeof v.decimals === "number" && v.decimals >= 0 && v.decimals <= 3 ? v.decimals : base.decimals,
    weightUnit: v.weightUnit && isWeightUnit(v.weightUnit) ? v.weightUnit : base.weightUnit,
  };
}

/**
 * Etiqueta de balanza EAN-13 con prefijo 20-29: 2 + dígito + PLU + valor + verificador.
 * Devuelve el PLU (sin ceros a la izquierda y tal cual) y el valor (peso o precio).
 */
export function parseWeightBarcode(code: string, format: WeightBarcodeFormat) {
  const trimmed = code.trim();
  if (!format.enabled || !isValidEan13(trimmed) || trimmed[0] !== "2") return null;
  const plu = trimmed.slice(2, 2 + format.pluDigits);
  const raw = trimmed.slice(2 + format.pluDigits, 12);
  const value = Number(raw) / 10 ** format.decimals;
  if (!Number.isFinite(value) || value <= 0) return null;
  return { plu, pluNumber: String(Number(plu)), value };
}

/** ¿El producto es el de la etiqueta? Por código de barras o SKU igual al PLU (con o sin ceros). */
export function matchesPlu(product: { barcode: string | null; sku: string | null }, plu: string) {
  const bare = String(Number(plu));
  return [product.barcode, product.sku].some((c) => c !== null && (c === plu || c === bare));
}

/**
 * Cantidad a vender por una etiqueta: el peso convertido a la unidad del producto, o el
 * precio impreso entre el precio del producto.
 */
export function labelQuantity(
  value: number,
  format: WeightBarcodeFormat,
  product: { unit: string; price: number }
): number | null {
  if (!isWeightUnit(product.unit)) return null;
  if (format.valueType === "PRICE") {
    if (product.price <= 0) return null;
    return Math.round((value / product.price) * 1000) / 1000;
  }
  return convertWeight(value, format.weightUnit, product.unit);
}
