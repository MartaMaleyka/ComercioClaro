import type { AuthContext } from "@/lib/auth";
import { dayKey } from "@/lib/dates";
import { monthKeys } from "@/server/accounting";

/** Periodo de la consulta: las fechas indicadas o el mes en curso. */
export function accountingRange(auth: AuthContext, query: { from?: string; to?: string }) {
  const current = monthKeys(dayKey(new Date(), auth.business.timezone).slice(0, 7));
  const fromKey = query.from ?? current.fromKey;
  const toKey = query.to ?? current.toKey;
  return fromKey <= toKey ? { fromKey, toKey } : { fromKey: toKey, toKey: fromKey };
}
