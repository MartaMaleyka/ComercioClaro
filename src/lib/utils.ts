export interface FormatOptions {
  currency?: string;
  locale?: string;
  timeZone?: string;
}

/**
 * Formatea un monto. Con `balboa` (Panamá) los dólares se muestran como B/.,
 * ya que el balboa circula a la par del dólar.
 */
export function formatCurrency(amount: number, currency = "MXN", locale = "es-MX", balboa = false) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: balboa && currency === "USD" ? "PAB" : currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
  }
}

export function formatNumber(value: number, locale = "es-MX", maxFractionDigits = 3) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function formatDate(date: Date | string, locale = "es-MX", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string, locale = "es-MX", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(date));
}

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export const UNIT_LABELS: Record<string, string> = {
  PIECE: "pza",
  KG: "kg",
  G: "g",
  L: "l",
  ML: "ml",
  M: "m",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Fiado",
  YAPPY: "Yappy",
};

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  COUNT: "Conteo físico",
  WASTE: "Merma",
  EXPIRED: "Caducidad",
  THEFT: "Robo",
  DAMAGED: "Dañado",
  OTHER: "Otro",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INITIAL: "Inventario inicial",
  SALE: "Venta",
  SALE_CANCEL: "Venta cancelada",
  SALE_RETURN: "Devolución",
  PURCHASE: "Compra",
  PURCHASE_CANCEL: "Compra cancelada",
  ADJUSTMENT: "Ajuste",
  TRANSFER_OUT: "Traspaso enviado",
  TRANSFER_IN: "Traspaso recibido",
};

/** Unidades que admiten cantidades fraccionarias (venta a granel). */
export function isFractionalUnit(unit: string) {
  return unit !== "PIECE";
}
