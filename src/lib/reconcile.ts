/**
 * Conciliación de depósitos bancarios (Yappy, transferencias, tarjeta) contra las ventas.
 * Código puro: se usa en el servidor y se prueba sin base de datos.
 */
import { parseCsv } from "./csv";

export interface BankLine {
  /** Fila del archivo (1 = primera fila de datos) */
  row: number;
  date: string;
  description: string;
  reference: string;
  amount: number;
}

export interface ReconcileSale {
  id: string;
  folio: number;
  date: string;
  total: number;
  reference: string | null;
  method: string;
}

export interface Match {
  line: BankLine;
  sales: ReconcileSale[];
  type: "reference" | "amount" | "daily";
  /** Depósito − ventas (negativo si llegó menos, p. ej. por comisión) */
  difference: number;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const HEADERS = {
  date: [
    "fecha",
    "date",
    "fecha transaccion",
    "fecha de transaccion",
    "fecha valor",
    "fecha operacion",
    "f. operacion",
  ],
  description: ["descripcion", "concepto", "detalle", "description", "glosa", "movimiento", "transaccion"],
  reference: [
    "referencia",
    "ref",
    "ref.",
    "no. referencia",
    "numero de referencia",
    "operacion",
    "no. operacion",
    "comprobante",
    "documento",
    "reference",
  ],
  amount: ["monto", "importe", "amount", "valor", "monto b/.", "monto usd"],
  credit: ["credito", "creditos", "abono", "abonos", "deposito", "depositos", "credit", "entrada"],
  debit: ["debito", "debitos", "cargo", "cargos", "retiro", "retiros", "debit", "salida"],
} as const;

type Column = keyof typeof HEADERS;

function findColumns(header: string[]) {
  const normalized = header.map(normalize);
  const columns: Partial<Record<Column, number>> = {};
  for (const key of Object.keys(HEADERS) as Column[]) {
    const index = normalized.findIndex((h) => (HEADERS[key] as readonly string[]).includes(h));
    if (index >= 0) columns[key] = index;
  }
  // Coincidencia parcial ("Monto (B/.)", "Fecha de la transacción") si no hubo exacta.
  for (const key of Object.keys(HEADERS) as Column[]) {
    if (columns[key] !== undefined) continue;
    const index = normalized.findIndex(
      (h, i) =>
        !Object.values(columns).includes(i) && (HEADERS[key] as readonly string[]).some((alias) => h.startsWith(alias))
    );
    if (index >= 0) columns[key] = index;
  }
  return columns;
}

/** Monto en formatos 1,234.56 · 1.234,56 · B/. 12.50 · (12.50) · -12.50. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Coma decimal si le siguen 1 o 2 dígitos (1.234,56); si no, es separador de miles (1,234).
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

const MONTHS: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

/** Fecha en formatos dd/mm/aaaa, aaaa-mm-dd, dd-mm-aa, dd.mm.aaaa o 12-sep-2026 → "YYYY-MM-DD". */
export function parseBankDate(raw: string): string | null {
  const s = normalize(raw).replace(/\s.*$/, "");
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[-/ ]([a-z]{3})[a-z]*[-/ ](\d{2,4})$/)) && MONTHS[match[2]]) {
    [d, m, y] = [Number(match[1]), MONTHS[match[2]], Number(match[3])];
  } else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface ParsedStatement {
  lines: BankLine[];
  skipped: number;
  columns: Partial<Record<Column, number>>;
}

/** Lee el estado de cuenta: detecta encabezados y toma solo los créditos (dinero que entra). */
export function parseBankStatement(csv: string): ParsedStatement {
  const rows = parseCsv(csv);
  let headerIndex = -1;
  let columns: Partial<Record<Column, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const found = findColumns(rows[i]);
    if (found.date !== undefined && (found.amount !== undefined || found.credit !== undefined)) {
      headerIndex = i;
      columns = found;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error("No se encontraron las columnas de fecha y monto en el archivo");
  }

  const lines: BankLine[] = [];
  let skipped = 0;
  rows.slice(headerIndex + 1).forEach((row, i) => {
    const cell = (key: Column) => (columns[key] !== undefined ? (row[columns[key]!] ?? "").trim() : "");
    const date = parseBankDate(cell("date"));
    const credit = columns.credit !== undefined ? parseAmount(cell("credit")) : null;
    const debit = columns.debit !== undefined ? parseAmount(cell("debit")) : null;
    const amount = credit ?? (columns.amount !== undefined ? parseAmount(cell("amount")) : null);
    if (!date || amount === null || amount <= 0 || (debit !== null && debit > 0 && !credit)) {
      skipped++;
      return;
    }
    lines.push({ row: i + 1, date, description: cell("description"), reference: cell("reference"), amount });
  });
  return { lines, skipped, columns };
}

const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const alnum = (s: string) => normalize(s).replace(/[^a-z0-9]/g, "");

/**
 * Cruza depósitos con ventas en tres pasadas:
 * 1. Número de operación de la venta dentro de la referencia o descripción del depósito.
 * 2. Mismo monto (bruto o neto de comisión) con fecha a lo más un día de distancia.
 * 3. Depósito que suma las ventas de un día (lotes de tarjeta).
 */
export function reconcile(lines: BankLine[], sales: ReconcileSale[], feeRate = 0) {
  const tolerance = 0.01;
  const usedSales = new Set<string>();
  const usedLines = new Set<number>();
  const matches: Match[] = [];
  const amountFits = (amount: number, total: number) =>
    Math.abs(amount - total) <= tolerance || (feeRate > 0 && Math.abs(amount - round2(total * (1 - feeRate))) <= 0.02);

  const take = (line: BankLine, matched: ReconcileSale[], type: Match["type"]) => {
    usedLines.add(line.row);
    matched.forEach((s) => usedSales.add(s.id));
    matches.push({
      line,
      sales: matched,
      type,
      difference: round2(line.amount - matched.reduce((a, s) => a + s.total, 0)),
    });
  };

  // 1. Por referencia
  for (const line of lines) {
    const haystack = alnum(`${line.reference} ${line.description}`);
    const sale = sales.find((s) => {
      if (usedSales.has(s.id) || !s.reference) return false;
      const ref = alnum(s.reference);
      return ref.length >= 4 && haystack.includes(ref);
    });
    if (sale) take(line, [sale], "reference");
  }

  // 2. Por monto y fecha
  for (const line of lines) {
    if (usedLines.has(line.row)) continue;
    const candidates = sales
      .filter((s) => !usedSales.has(s.id) && daysBetween(s.date, line.date) <= 1 && amountFits(line.amount, s.total))
      .sort((a, b) => daysBetween(a.date, line.date) - daysBetween(b.date, line.date) || a.folio - b.folio);
    if (candidates.length > 0) take(line, [candidates[0]], "amount");
  }

  // 3. Lote diario (suma de ventas de un día o del anterior)
  for (const line of lines) {
    if (usedLines.has(line.row)) continue;
    for (const offset of [0, 1]) {
      const day = new Date(Date.parse(`${line.date}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
      const group = sales.filter((s) => !usedSales.has(s.id) && s.date === day);
      if (group.length < 2) continue;
      const total = round2(group.reduce((a, s) => a + s.total, 0));
      if (amountFits(line.amount, total)) {
        take(line, group, "daily");
        break;
      }
    }
  }

  const unmatchedLines = lines.filter((l) => !usedLines.has(l.row));
  const unmatchedSales = sales.filter((s) => !usedSales.has(s.id));
  return {
    matches,
    unmatchedLines,
    unmatchedSales,
    totals: {
      deposits: round2(lines.reduce((a, l) => a + l.amount, 0)),
      sales: round2(sales.reduce((a, s) => a + s.total, 0)),
      matchedDeposits: round2(matches.reduce((a, m) => a + m.line.amount, 0)),
      unmatchedDeposits: round2(unmatchedLines.reduce((a, l) => a + l.amount, 0)),
      missingSales: round2(unmatchedSales.reduce((a, s) => a + s.total, 0)),
    },
  };
}
