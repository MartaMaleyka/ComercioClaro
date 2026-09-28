"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardPaste, Download, FileUp, Layers, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { BULK_MAX_ROWS, BULK_SPECS, checkRow, mapTable, parseTable, templateCsv, type BulkEntity } from "@/lib/bulk";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface Result {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

/** Botón "Carga masiva" que abre la ventana para pegar desde Excel o subir un CSV. */
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
  const [text, setText] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const table = useMemo(() => (text.trim() ? mapTable(spec, parseTable(text)) : null), [text, spec]);
  const checks = useMemo(() => (table ? table.records.map((r) => checkRow(entity, r)) : []), [table, entity]);
  const valid = checks.filter((c) => c.ok).length;
  const invalid = checks.length - valid;
  const tooMany = checks.length > BULK_MAX_ROWS;
  const shownColumns = spec.columns.filter((c) => table?.mapping.includes(c.key)).slice(0, 4);
  const rows = (table?.records ?? [])
    .map((record, i) => ({ record, check: checks[i], line: i + 2 }))
    .filter((r) => !onlyErrors || !r.check.ok)
    .slice(0, 100);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(tr("El archivo es demasiado grande (máximo 2 MB)"));
      return;
    }
    setText(await file.text());
    setResult(null);
  }

  async function save() {
    if (!table) return;
    setSaving(true);
    try {
      // Solo se mandan las filas listas, con su número de fila para que los avisos coincidan con la hoja.
      const ready = table.records.map((r, i) => ({ r, line: i + 2, ok: checks[i].ok })).filter((x) => x.ok);
      const res = await api<Result>(`/api/bulk/${entity}`, {
        body: { rows: ready.map((x) => x.r), lines: ready.map((x) => x.line) },
      });
      setResult(res);
      onDone?.();
      if (res.errors.length === 0) toast.success(tr("Carga masiva terminada"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(spec))}`;

  return (
    <Modal open onClose={onClose} size="lg" title={tr("Carga masiva de {noun}", { noun: tr(spec.noun) })}>
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
            <div className="text-left rounded-2xl bg-red-50 p-4 space-y-2">
              <p className="font-semibold text-red-700">
                {tr("{n} filas no se guardaron", { n: result.errors.length })}
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
            <Button variant="secondary" onClick={() => setResult(null)}>
              {tr("Cargar más")}
            </Button>
            <Button onClick={onClose}>{tr("Listo")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <li className="rounded-2xl bg-slate-100 p-3">
              <span className="font-bold text-slate-900">1. </span>
              <a href={templateHref} download={`plantilla-${entity}.csv`} className="font-semibold text-brand-700 dark:text-brand-300 underline inline-flex items-center gap-1">
                <Download className="w-4 h-4" aria-hidden="true" /> {tr("Descarga la plantilla")}
              </a>{" "}
              <span className="text-slate-600">{tr("o usa tu propia hoja")}</span>
            </li>
            <li className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <span className="font-bold text-slate-900">2. </span>
              {tr("Copia las filas en Excel (con los encabezados) y pégalas abajo, o sube el CSV")}
            </li>
            <li className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <span className="font-bold text-slate-900">3. </span>
              {tr("Revisa la vista previa y confirma")}
            </li>
          </ol>

          <div className="flex flex-wrap gap-1.5" aria-label={tr("Columnas que se reconocen")}>
            {spec.columns.map((c) => (
              <Badge key={c.key} tone={table?.mapping.includes(c.key) ? "green" : c.required ? "amber" : "gray"} dot={table?.mapping.includes(c.key)}>
                {tr(c.label)}
                {c.required && " *"}
              </Badge>
            ))}
          </div>

          <Textarea
            label={tr("Pega aquí tus filas")}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            rows={6}
            className="font-mono text-sm"
            placeholder={spec.columns.map((c) => c.label).join("\t")}
            hint={tr("Si ya existe, se reconoce por: {key}", { key: tr(spec.matchBy) })}
          />
          {spec.note && (
            <p role="note" className="rounded-2xl bg-slate-100 text-slate-700 px-4 py-2.5 text-sm">
              {tr(spec.note)}
            </p>
          )}
          <label className="press inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border-[1.5px] border-slate-300 text-sm font-semibold text-slate-800 cursor-pointer hover:border-slate-900">
            <FileUp className="w-4 h-4" aria-hidden="true" />
            {tr("Subir archivo CSV")}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
          </label>

          {!table && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <ClipboardPaste className="w-4 h-4" aria-hidden="true" />
              {tr("Aún no hay filas. Pega desde Excel o sube un archivo para ver la vista previa.")}
            </p>
          )}

          {table && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" role="status">
                <Badge tone="gray">{tr("{n} filas", { n: checks.length })}</Badge>
                <Badge tone="green" dot>
                  {tr("{n} listas", { n: valid })}
                </Badge>
                {invalid > 0 && (
                  <Badge tone="red" dot>
                    {tr("{n} con errores", { n: invalid })}
                  </Badge>
                )}
                {invalid > 0 && (
                  <Checkbox
                    label={tr("Ver solo las filas con errores")}
                    checked={onlyErrors}
                    onChange={(e) => setOnlyErrors(e.target.checked)}
                    className="ml-auto"
                  />
                )}
              </div>
              {table.missing.length > 0 && (
                <p role="alert" className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
                  {tr("Faltan columnas obligatorias: {cols}", { cols: table.missing.map((m) => tr(m)).join(", ") })}
                </p>
              )}
              {table.ignored.length > 0 && (
                <p className="text-sm text-mango-800 bg-mango-50 rounded-2xl px-4 py-2.5">
                  {tr("Columnas que no se usarán: {cols}", { cols: table.ignored.join(", ") })}
                </p>
              )}
              {tooMany && (
                <p role="alert" className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
                  {tr("Máximo {n} filas por carga; divide el archivo en partes", { n: BULK_MAX_ROWS })}
                </p>
              )}
              <div
                className="overflow-x-auto max-h-72 overflow-y-auto rounded-2xl border border-slate-200"
                tabIndex={0}
                role="region"
                aria-label={tr("Vista previa")}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2">{tr("Fila")}</th>
                      {shownColumns.map((c) => (
                        <th key={c.key} className="px-3 py-2">
                          {tr(c.label)}
                        </th>
                      ))}
                      <th className="px-3 py-2">{tr("Estado")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ record, check, line }) => (
                      <tr key={line} className={cn("border-t border-slate-100", !check.ok && "bg-red-50/60")}>
                        <td className="px-3 py-2 text-slate-500 tabular-nums">{line}</td>
                        {shownColumns.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-slate-800 max-w-40 truncate">
                            {record[c.key] ?? ""}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {check.ok ? (
                            <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300 font-semibold">
                              <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {tr("Lista")}
                            </span>
                          ) : (
                            <span className="inline-flex items-start gap-1 text-red-700 font-medium">
                              <XCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {check.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {checks.length > 100 && (
                <p className="text-xs text-slate-500">{tr("Se muestran las primeras 100 filas.")}</p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>
              {tr("Cancelar")}
            </Button>
            <Button
              onClick={save}
              loading={saving}
              disabled={!table || valid === 0 || table.missing.length > 0 || tooMany}
            >
              {invalid > 0
                ? tr("Importar {n} filas listas", { n: valid })
                : tr("Importar {n} filas", { n: valid })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
