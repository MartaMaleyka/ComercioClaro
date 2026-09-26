/**
 * Utilidades de fechas por zona horaria del negocio. La base guarda instantes en UTC;
 * los "días" (hoy, mes, reportes diarios) se calculan en la zona del negocio.
 */

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)])
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return parts;
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante. */
function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC correspondiente a las 00:00 del día indicado en la zona. */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day);
  let result = guess - offsetMs(new Date(guess), timeZone);
  const corrected = guess - offsetMs(new Date(result), timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** Clave de día "YYYY-MM-DD" en la zona del negocio. */
export function dayKey(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function startOfDay(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return zonedMidnight(p.year, p.month, p.day, timeZone);
}

export function startOfMonth(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return zonedMidnight(p.year, p.month, 1, timeZone);
}

export function addDays(key: string, days: number) {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

/** Inicio (inclusive) y fin (exclusivo) de un rango de días locales. */
export function dayRange(fromKey: string, toKey: string, timeZone: string) {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(addDays(toKey, 1));
  return {
    start: zonedMidnight(from.year, from.month, from.day, timeZone),
    end: zonedMidnight(to.year, to.month, to.day, timeZone),
  };
}

/** Lista de claves de día entre dos fechas (inclusive). */
export function dayKeysBetween(fromKey: string, toKey: string) {
  const keys: string[] = [];
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) keys.push(k);
  return keys;
}
