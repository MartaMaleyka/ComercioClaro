"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Columns3, Download, FileUp, Layers, Plus, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import {
  BULK_MAX_ROWS,
  BULK_SPECS,
  checkRow,
  mapTable,
  parseTable,
  templateCsv,
  type BulkEntity,
  type RowCheck,
} from "@/lib/bulk";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface Result {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

interface GridRow {
  id: number;
  cells: Record<string, string>;
}

/** Columnas que se ven de entrada; el resto aparece con "Ver todas las columnas". */
const FIRST_COLUMNS = 6;
const START_ROWS = 5;

let nextRowId = 0;
const blank = (n: number): GridRow[] => Array.from({ length: n }, () => ({ id: nextRowId++, cells: {} }));

/** Botón "Carga masiva" que abre la tabla para escribir o pegar varias filas a la vez. */
export function BulkImportButton({
  entity,
  onDone,
  label,
  variant = "secondary",
}: {
  entity: BulkEntity;
  onDone?: () => void;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Layers className="w-4 h-4" aria-hidden="true" /> {label ?? tr("Carga masiva")}
      </Button>
      {open && <BulkImportModal entity={entity} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}

const isEmpty = (cells: Record<string, string>) => Object.values(cells).every((v) => v.trim() === "");

/** Lo copiado de Excel viene separado por tabulaciones; una sola columna viene por líneas. */
function parseClipboard(text: string) {
  const clean = text.replace(/\r?\n$/, "");
  return clean.includes("\t") ? parseTable(clean) : clean.split(/\r?\n/).map((line) => [line]);
}

export function BulkImportModal({
  entity,
  onClose,
  onDone,
}: {
  entity: BulkEntity;
  onClose: () => void;
  onDone?: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const spec = BULK_SPECS[entity];
  const gridRef = useRef<HTMLDivElement>(null);
  const [rows, setRowsRaw] = useState<GridRow[]>(() => blank(START_ROWS));
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  /** Siempre queda una fila vacía al final para seguir escribiendo. */
  function setRows(update: (prev: GridRow[]) => GridRow[]) {
    setRowsRaw((prev) => {
      const next = update(prev);
      if (next.length === 0 || !isEmpty(next[next.length - 1].cells)) return [...next, ...blank(1)];
      return next;
    });
  }

  const columns = useMemo(() => {
    if (showAll) return spec.columns;
    const withData = new Set(rows.flatMap((r) => Object.keys(r.cells).filter((k) => r.cells[k].trim() !== "")));
    return spec.columns.filter((c, i) => i < FIRST_COLUMNS || c.required || withData.has(c.key));
  }, [showAll, spec, rows]);
  const hiddenCount = spec.columns.length - columns.length;

  const checks = useMemo(
    () =>
      rows.map((r): RowCheck | null => {
        if (isEmpty(r.cells)) return null;
        const record = Object.fromEntries(
          Object.entries(r.cells)
            .map(([k, v]) => [k, v.trim()])
            .filter(([, v]) => v !== "")
        );
        return checkRow(entity, record);
      }),
    [rows, entity]
  );
  const filled = checks.filter(Boolean).length;
  const valid = checks.filter((c) => c?.ok).length;
  const invalid = filled - valid;
  const tooMany = filled > BULK_MAX_ROWS;

  function setCell(index: number, key: string, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, cells: { ...r.cells, [key]: value } } : r)));
  }

  function focusCell(row: number, col: number) {
    // Espera a que se pinte la fila nueva si hizo falta agregarla.
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`)?.focus();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (row + 1 >= rows.length) setRows((prev) => [...prev, ...blank(1)]);
      focusCell(row + 1, col);
    } else if (e.key === "ArrowUp" && row > 0) {
      e.preventDefault();
      focusCell(row - 1, col);
    }
  }

  /** Pegar varias celdas desde Excel: con encabezados cada columna cae en su lugar; sin ellos, desde la celda actual. */
  function onPaste(e: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !/\r?\n./.test(text)) return;
    e.preventDefault();
    const table = parseClipboard(text);
    const mapped = mapTable(spec, table);
    const headerCells = (table[0] ?? []).filter((h) => h.trim() !== "").length;
    const known = mapped.mapping.filter(Boolean).length;
    let records: Record<string, string>[];
    if (known > 0 && known * 2 >= headerCells) {
      records = mapped.records;
      if (mapped.ignored.length > 0) {
        setNotice(tr("Columnas que no se usarán: {cols}", { cols: mapped.ignored.join(", ") }));
      }
    } else {
      const keys = columns.slice(col).map((c) => c.key);
      records = table.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? "").trim()])));
    }
    records = records.filter((r) => !isEmpty(r));
    setRows((prev) => {
      const next = [...prev];
      records.forEach((record, i) => {
        const at = row + i;
        if (at >= next.length) next.push(...blank(1));
        next[at] = { ...next[at], cells: { ...next[at].cells, ...record } };
      });
      return next;
    });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(tr("El archivo es demasiado grande (máximo 2 MB)"));
      return;
    }
    const table = mapTable(spec, parseTable(await file.text()));
    const records = table.records.filter((r) => !isEmpty(r));
    setRows((prev) => [...prev.filter((r) => !isEmpty(r.cells)), ...records.map((cells) => ({ id: nextRowId++, cells }))]);
    setNotice(
      [
        records.length === 1 ? tr("Se cargó 1 fila del archivo") : tr("Se cargaron {n} filas del archivo", { n: records.length }),
        table.ignored.length > 0 ? tr("Columnas que no se usarán: {cols}", { cols: table.ignored.join(", ") }) : "",
      ]
        .filter(Boolean)
        .join(". ")
    );
    setResult(null);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      // Solo se mandan las filas listas, con su número de fila para que los avisos coincidan con la tabla.
      const ready = rows.map((r, i) => ({ r, line: i + 1, check: checks[i] })).filter((x) => x.check?.ok);
      const pending = rows
        .map((_, i) => ({ row: i + 1, check: checks[i] }))
        .flatMap((x) => (x.check && !x.check.ok ? [{ row: x.row, error: x.check.error }] : []));
      const res = await api<Result>(`/api/bulk/${entity}`, {
        body: {
          rows: ready.map((x) =>
            Object.fromEntries(
              Object.entries(x.r.cells)
                .map(([k, v]) => [k, v.trim()])
                .filter(([, v]) => v !== "")
            )
          ),
          lines: ready.map((x) => x.line),
        },
      });
      setResult({ ...res, errors: [...pending, ...res.errors].sort((a, b) => a.row - b.row) });
      onDone?.();
      if (res.errors.length === 0 && pending.length === 0) toast.success(tr("Carga masiva terminada"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  /** Vuelve a la tabla solo con las filas que no se guardaron, para corregirlas. */
  function fixPending() {
    if (!result) return;
    const failed = new Set(result.errors.map((e) => e.row));
    setRows(() => rows.filter((_, i) => failed.has(i + 1)));
    setNotice(null);
    setResult(null);
  }

  function startOver() {
    setRowsRaw(blank(START_ROWS));
    setNotice(null);
    setResult(null);
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(spec))}`;

  return (
    <Modal open onClose={onClose} size="xl" title={tr("Carga masiva de {noun}", { noun: tr(spec.noun) })}>
      {result ? (
        <div className="space-y-4 text-center">
          <span
            className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center ring-8 ring-brand-50 animate-[pop_360ms_cubic-bezier(.2,.8,.2,1)]"
            aria-hidden="true"
          >
            <CheckCircle2 className="w-8 h-8" />
          </span>
          <p role="status" className="text-lg font-bold text-slate-900">
            {tr("{created} nuevos · {updated} actualizados", { created: result.created, updated: result.updated })}
            {result.skipped > 0 && ` · ${tr("{n} ya existían", { n: result.skipped })}`}
          </p>
          {result.errors.length > 0 && (
            <div className="text-left rounded-2xl bg-red-50 p-4 space-y-2 max-w-2xl mx-auto">
              <p className="font-semibold text-red-700">
                {result.errors.length === 1
                  ? tr("1 fila no se guardó")
                  : tr("{n} filas no se guardaron", { n: result.errors.length })}
              </p>
              <ul className="text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    {tr("Fila {n}", { n: e.row })}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            {result.errors.length > 0 ? (
              <Button variant="secondary" onClick={fixPending}>
                {tr("Corregir las que faltaron")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={startOver}>
                {tr("Cargar más")}
              </Button>
            )}
            <Button onClick={onClose}>{tr("Listo")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <p className="text-sm text-slate-700 flex-1">
              {tr("Escribe en la tabla o pega desde Excel en cualquier celda. Si copias los encabezados, cada columna cae en su lugar.")}{" "}
              <span className="text-slate-600">{tr("Si ya existe, se reconoce por: {key}", { key: tr(spec.matchBy) })}</span>
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <a
                href={templateHref}
                download={`plantilla-${entity}.csv`}
                className="press inline-flex items-center gap-2 min-h-11 px-4 rounded-xl text-sm font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-50"
              >
                <Download className="w-4 h-4" aria-hidden="true" /> {tr("Descarga la plantilla")}
              </a>
              <label className="press inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border-[1.5px] border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer hover:border-slate-900 focus-within:ring-4 focus-within:ring-brand-600/15">
                <FileUp className="w-4 h-4" aria-hidden="true" />
                {tr("Subir archivo CSV")}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          {spec.note && (
            <p className="rounded-2xl bg-blue-50 text-blue-800 px-4 py-2.5 text-sm font-medium">{tr(spec.note)}</p>
          )}
          {notice && (
            <p role="status" className="rounded-2xl bg-mango-50 text-mango-800 px-4 py-2.5 text-sm font-medium">
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2" role="status">
            <Badge tone="gray">{filled === 1 ? tr("1 fila") : tr("{n} filas", { n: filled })}</Badge>
            <Badge tone="green" dot>
              {tr("{n} listas", { n: valid })}
            </Badge>
            {invalid > 0 && (
              <Badge tone="red" dot>
                {tr("{n} con errores", { n: invalid })}
              </Badge>
            )}
          </div>
          {tooMany && (
            <p role="alert" className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
              {tr("Máximo {n} filas por carga; divide el archivo en partes", { n: BULK_MAX_ROWS })}
            </p>
          )}

          <div
            ref={gridRef}
            className="overflow-auto max-h-[52vh] rounded-2xl border border-slate-200"
            tabIndex={0}
            role="region"
            aria-label={tr("Tabla de carga")}
          >
            <table className="text-sm border-separate border-spacing-0 min-w-full">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold text-slate-700">
                <tr>
                  <th scope="col" className="px-2 py-2 w-10 text-center">
                    {tr("Fila")}
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className="px-2 py-2 min-w-36 whitespace-nowrap">
                      {tr(c.label)}
                      {c.required && (
                        <span className="text-red-600 ml-0.5" aria-hidden="true">
                          *
                        </span>
                      )}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 min-w-56">
                    {tr("Estado")}
                  </th>
                  <th scope="col" className="px-2 py-2 w-11">
                    <span className="sr-only">{tr("Quitar")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const check = checks[i];
                  const bad = check && !check.ok ? check : null;
                  return (
                    <tr key={r.id} className={cn(bad && "bg-red-50/60")}>
                      <td className="px-2 py-1 border-t border-slate-100 text-center text-slate-500 tabular-nums">{i + 1}</td>
                      {columns.map((c, j) => {
                        const wrong = bad?.field === c.key;
                        return (
                          <td key={c.key} className="p-1 border-t border-slate-100">
                            <input
                              data-cell={`${i}-${j}`}
                              value={r.cells[c.key] ?? ""}
                              onChange={(e) => setCell(i, c.key, e.target.value)}
                              onKeyDown={(e) => onKeyDown(e, i, j)}
                              onPaste={(e) => onPaste(e, i, j)}
                              placeholder={i === 0 ? c.example : undefined}
                              aria-label={tr("{col} fila {n}", { col: tr(c.label), n: i + 1 })}
                              aria-invalid={wrong || undefined}
                              className={cn(
                                "w-full min-h-10 px-2.5 rounded-lg bg-surface border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-600/15 focus:border-brand-600",
                                wrong ? "border-red-500 bg-red-50" : "border-slate-200 hover:border-slate-400"
                              )}
                            />
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 border-t border-slate-100">
                        {check?.ok && (
                          <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300 font-semibold">
                            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {tr("Lista")}
                          </span>
                        )}
                        {bad && (
                          <span className="inline-flex items-start gap-1 text-red-700 font-medium">
                            <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {bad.error}
                          </span>
                        )}
                      </td>
                      <td className="p-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="press w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50"
                          title={tr("Quitar fila {n}", { n: i + 1 })}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">{tr("Quitar fila {n}", { n: i + 1 })}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRows((prev) => [...prev, ...blank(1)]);
                focusCell(rows.length, 0);
              }}
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar fila")}
            </Button>
            <Button variant="secondary" onClick={() => setRows((prev) => [...prev, ...blank(10)])}>
              <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar 10 filas")}
            </Button>
            {(hiddenCount > 0 || showAll) && (
              <Button variant="secondary" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
                <Columns3 className="w-4 h-4" aria-hidden="true" />
                {showAll ? tr("Ver menos columnas") : tr("Ver todas las columnas ({n} más)", { n: hiddenCount })}
              </Button>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose}>
              {tr("Cancelar")}
            </Button>
            <Button onClick={save} loading={saving} disabled={valid === 0 || tooMany}>
              {valid === 1
                ? invalid > 0
                  ? tr("Importar 1 fila lista")
                  : tr("Importar 1 fila")
                : invalid > 0
                  ? tr("Importar {n} filas listas", { n: valid })
                  : tr("Importar {n} filas", { n: valid })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
