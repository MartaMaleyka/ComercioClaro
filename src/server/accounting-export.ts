import type { JournalEntry } from "./accounting";
import { toCsv } from "@/lib/csv";
import { toSpreadsheet } from "@/lib/spreadsheet";
import { dayKey } from "@/lib/dates";
import type { ledger } from "./accounting";

type Ledger = Awaited<ReturnType<typeof ledger>>;

const JOURNAL_HEADERS = [
  "Fecha",
  "Asiento",
  "Referencia",
  "Concepto",
  "Cuenta",
  "Nombre de la cuenta",
  "Debe",
  "Haber",
];
const LEDGER_HEADERS = ["Cuenta", "Nombre", "Fecha", "Referencia", "Concepto", "Debe", "Haber", "Saldo"];

function journalRows(entries: JournalEntry[], timeZone: string) {
  return entries.flatMap((e, i) =>
    e.lines.map((l) => [
      dayKey(e.date, timeZone),
      i + 1,
      e.reference,
      e.description,
      l.account.code,
      l.account.name,
      l.debit.toNumber(),
      l.credit.toNumber(),
    ])
  );
}

function ledgerRows(accounts: Ledger, timeZone: string) {
  return accounts.flatMap((a) => [
    [a.code, a.name, "", "", "Saldo inicial", "", "", a.opening.toNumber()],
    ...a.lines.map((l) => [
      a.code,
      a.name,
      dayKey(l.date, timeZone),
      l.reference,
      l.description,
      l.debit.toNumber(),
      l.credit.toNumber(),
      l.balance.toNumber(),
    ]),
  ]);
}

export function journalCsv(entries: JournalEntry[], timeZone: string) {
  return toCsv(JOURNAL_HEADERS, journalRows(entries, timeZone));
}

export function ledgerCsv(accounts: Ledger, timeZone: string) {
  return toCsv(LEDGER_HEADERS, ledgerRows(accounts, timeZone));
}

/** Libro diario y mayor en un solo archivo de Excel (una hoja cada uno). */
export function booksSpreadsheet(entries: JournalEntry[], accounts: Ledger, timeZone: string) {
  return toSpreadsheet([
    { name: "Libro diario", headers: JOURNAL_HEADERS, rows: journalRows(entries, timeZone) },
    { name: "Libro mayor", headers: LEDGER_HEADERS, rows: ledgerRows(accounts, timeZone) },
  ]);
}
