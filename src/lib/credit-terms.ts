/**
 * Plazos del fiado. En Panamá el pago más común es quincenal (el 15 y el último día del mes),
 * y en el campo se paga al vender la cosecha (fecha fija).
 */
import { addDays, dayKey, parseDayKey, zonedMidnight } from "./dates";

export type CreditTerm = "DAYS" | "QUINCENA" | "FIXED";

/** Próxima quincena posterior al día de la venta: "YYYY-MM-DD". */
export function nextPaydayKey(date: Date, timeZone: string) {
  const { year, month, day } = parseDayKey(dayKey(date, timeZone));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (day < 15) return `${year}-${pad(month)}-15`;
  if (day < lastDay) return `${year}-${pad(month)}-${pad(lastDay)}`;
  // Fiado en el último día del mes: vence el 15 del mes siguiente.
  return month === 12 ? `${year + 1}-01-15` : `${year}-${pad(month + 1)}-15`;
}

/** Fin del día indicado en la zona del negocio (la deuda vence al terminar ese día). */
function endOfDayKey(key: string, timeZone: string) {
  const next = parseDayKey(addDays(key, 1));
  return zonedMidnight(next.year, next.month, next.day, timeZone);
}

export function creditDueDate(
  customer: {
    creditTerm: string;
    creditDays: number;
    creditDueDate: Date | null;
  },
  now: Date,
  timeZone: string
): Date {
  if (customer.creditTerm === "QUINCENA") return endOfDayKey(nextPaydayKey(now, timeZone), timeZone);
  if (customer.creditTerm === "FIXED" && customer.creditDueDate) {
    // La fecha fija se guarda como día calendario (medianoche UTC).
    const due = endOfDayKey(customer.creditDueDate.toISOString().slice(0, 10), timeZone);
    // Si la fecha ya pasó (la cosecha se atrasó), se usa el plazo en días hasta que se actualice.
    if (due.getTime() > now.getTime()) return due;
  }
  return new Date(now.getTime() + customer.creditDays * 24 * 60 * 60 * 1000);
}

/** Fin de la quincena en curso: el 15 o el último día del mes (incluye hoy si es día de pago). */
export function currentPaydayEnd(now: Date, timeZone: string) {
  return endOfDayKey(nextPaydayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone), timeZone);
}
