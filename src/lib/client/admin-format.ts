import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

// El panel del super admin no depende de un negocio: formatos de la plataforma (Panamá, UTC-5 sin horario de verano).
const LOCALE = "es-PA";
const TIME_ZONE = "America/Panama";

export const adminFmt = {
  money: (n: number | string | null | undefined, currency = "USD") => formatCurrency(Number(n ?? 0), currency, LOCALE),
  date: (d: string | Date) => formatDate(d, LOCALE, TIME_ZONE),
  dateTime: (d: string | Date) => formatDateTime(d, LOCALE, TIME_ZONE),
  /** "YYYY-MM-DD" (día de Panamá) para campos de fecha */
  dayInput: (d: string | Date | null | undefined) =>
    d
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(d))
      : "",
  /** Fin del día indicado en Panamá: la prueba o el pago vencen al terminar ese día. */
  endOfDay: (day: string) => (day ? `${day}T23:59:59-05:00` : null),
};
