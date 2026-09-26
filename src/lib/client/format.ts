"use client";

import { useSession } from "@/components/providers/SessionProvider";
import { formatCurrency, formatDate, formatDateTime, formatNumber, UNIT_LABELS } from "@/lib/utils";
import { countryConfig } from "@/lib/country";

/** Formateadores con la moneda, idioma y zona horaria del negocio activo. */
export function useFormat() {
  const { business } = useSession();
  const { currency, locale, timezone, showBalboa } = business;
  return {
    money: (n: number | null | undefined) => formatCurrency(Number(n ?? 0), currency, locale, showBalboa),
    number: (n: number | null | undefined, digits = 3) => formatNumber(Number(n ?? 0), locale, digits),
    qty: (n: number | null | undefined, unit?: string) =>
      `${formatNumber(Number(n ?? 0), locale, 3)}${unit ? ` ${UNIT_LABELS[unit] ?? unit}` : ""}`,
    date: (d: string | Date) => formatDate(d, locale, timezone),
    dateTime: (d: string | Date) => formatDateTime(d, locale, timezone),
    currency: showBalboa && currency === "USD" ? "PAB" : currency,
    locale,
    timezone,
    country: countryConfig(business.country),
  };
}

/** Fecha local "YYYY-MM-DD" en la zona del negocio. */
export function todayKey(timeZone: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
