"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, RotateCcw, Wand2, XCircle } from "lucide-react";
import { api, withQuery } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useFormat } from "@/lib/client/format";
import type { Category, Product } from "@/lib/client/types";
import {
  adjustValue,
  cellNumber,
  marginPercent,
  type AdjustOp,
  type BulkEditNumber,
  type Rounding,
} from "@/lib/bulk-edit";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ListSkeleton } from "@/components/ui/Misc";

type TextField = "name" | BulkEditNumber;

interface Row {
  product: Product;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  wholesalePrice: string;
  minStock: string;
  archived: boolean;
}

interface Result {
  updated: number;
  archived: number;
  restored: number;
  errors: { id: string; error: string }[];
}

/** Filtros de la lista del inventario: la tabla trae todos los productos que coinciden. */
export interface BulkEditFilters {
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  archived?: boolean;
}

const MAX_PRODUCTS = 2000;
const numberText = (n: number | null | undefined) =>
  n == null ? "" : String(n);

function toRow(p: Product): Row {
  return {
    product: p,
    name: p.name,
    categoryId: p.categoryId ?? "",
    price: numberText(p.price),
    cost: numberText(p.cost ?? 0),
    wholesalePrice: numberText(p.wholesalePrice),
    minStock: numberText(p.minStock),
    archived: p.archivedAt != null,
  };
}

const NUMBER_LABELS: Record<BulkEditNumber, string> = {
  price: "Precio",
  cost: "Costo",
  wholesalePrice: "Precio mayoreo",
  minStock: "Stock mínimo",
};

/** Error de una celda (o null si está bien). */
function cellError(row: Row, field: TextField): string | null {
  if (field === "name")
    return row.name.trim() === "" ? "El nombre es obligatorio" : null;
  const value = row[field];
  if (field === "wholesalePrice" && value.trim() === "") return null;
  const n = cellNumber(value);
  if (n === null) return "Debe ser un número";
  if (n < 0) return "No puede ser negativo";
  return null;
}

/** Lo que cambió en una fila, listo para mandar al servidor. */
function patchOf(row: Row): Record<string, unknown> | null {
  const p = row.product;
  const patch: Record<string, unknown> = {};
  if (row.name.trim() !== p.name) patch.name = row.name.trim();
  if ((row.categoryId || null) !== p.categoryId)
    patch.categoryId = row.categoryId || null;
  for (const field of ["price", "cost", "minStock"] as const) {
    const n = cellNumber(row[field]);
    if (n !== null && n !== (p[field] ?? 0)) patch[field] = n;
  }
  const wholesale = cellNumber(row.wholesalePrice);
  if (wholesale !== p.wholesalePrice) patch.wholesalePrice = wholesale;
  if (row.archived !== (p.archivedAt != null)) patch.archived = row.archived;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Botón "Editar en lote" del inventario. */
export function BulkEditButton({
  filters,
  categories,
  onDone,
}: {
  filters: BulkEditFilters;
  categories: Category[];
  onDone: () => void;
}) {
  const tr = useText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Wand2 className="w-4 h-4" aria-hidden="true" /> {tr("Editar en lote")}
      </Button>
      {open && (
        <BulkEditModal
          filters={filters}
          categories={categories}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}

export function BulkEditModal({
  filters,
  categories,
  onClose,
  onDone,
}: {
  filters: BulkEditFilters;
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState<BulkEditNumber | "categoryId">("price");
  const [op, setOp] = useState<AdjustOp>("up%");
  const [amount, setAmount] = useState("");
  const [rounding, setRounding] = useState<Rounding>("none");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Trae todos los productos que coinciden con los filtros de la lista, página por página.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all: Product[] = [];
        let cursor: string | null | undefined;
        do {
          const page = await api<{
            items: Product[];
            nextCursor: string | null;
          }>(
            withQuery("/api/products", {
              search: filters.search || undefined,
              categoryId: filters.categoryId || undefined,
              lowStock: filters.lowStock || undefined,
              archived: filters.archived || undefined,
              limit: 200,
              cursor: cursor ?? undefined,
            }),
          );
          all.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor && all.length < MAX_PRODUCTS && !cancelled);
        if (cancelled) return;
        setTruncated(Boolean(cursor));
        setRows(all.slice(0, MAX_PRODUCTS).map(toRow));
      } catch (err) {
        if (!cancelled) setLoadError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.search, filters.categoryId, filters.lowStock, filters.archived]);

  const patches = useMemo(() => (rows ?? []).map(patchOf), [rows]);
  const errors = useMemo(
    () =>
      (rows ?? []).map((r) => {
        for (const f of [
          "name",
          "price",
          "cost",
          "wholesalePrice",
          "minStock",
        ] as const) {
          const e = cellError(r, f);
          if (e) return { field: f, error: e };
        }
        return null;
      }),
    [rows],
  );
  const changed = patches.filter(Boolean).length;
  const invalid = errors.filter(Boolean).length;
  const allSelected =
    rows !== null && rows.length > 0 && selected.size === rows.length;

  function update(index: number, change: Partial<Row>) {
    setRows(
      (prev) =>
        prev && prev.map((r, i) => (i === index ? { ...r, ...change } : r)),
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Aplica el cambio a las filas seleccionadas; se ve en la tabla y se guarda después. */
  function applyToSelected() {
    if (!rows) return;
    if (field === "categoryId") {
      setRows(
        rows.map((r) =>
          selected.has(r.product.id) ? { ...r, categoryId: category } : r,
        ),
      );
      return;
    }
    const n = cellNumber(amount);
    if (n === null || n < 0) {
      toast.error(tr("Escribe un valor válido"));
      return;
    }
    setRows(
      rows.map((r) => {
        if (!selected.has(r.product.id)) return r;
        const current = cellNumber(r[field]);
        // Un precio de mayoreo vacío solo se llena al fijar un valor.
        if (current === null && op !== "set") return r;
        return {
          ...r,
          [field]: String(
            adjustValue(
              current ?? 0,
              op,
              n,
              field === "minStock" ? "none" : rounding,
            ),
          ),
        };
      }),
    );
  }

  function setArchived(archived: boolean) {
    setRows(
      (prev) =>
        prev &&
        prev.map((r) => (selected.has(r.product.id) ? { ...r, archived } : r)),
    );
  }

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      const body = rows.flatMap((r, i) =>
        patches[i] && !errors[i] ? [{ id: r.product.id, ...patches[i] }] : [],
      );
      const res = await api<Result>("/api/products/bulk", {
        body: { rows: body },
      });
      setResult(res);
      onDone();
      if (res.errors.length === 0) toast.success(tr("Cambios guardados"));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const names = new Map(
    (rows ?? []).map((r) => [r.product.id, r.product.name]),
  );
  const numberField = field !== "categoryId";
  const percent = op === "up%" || op === "down%";

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={tr("Editar productos en lote")}
    >
      {result ? (
        <div className="space-y-4 text-center">
          <span
            className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center ring-8 ring-brand-50 animate-[pop_360ms_cubic-bezier(.2,.8,.2,1)]"
            aria-hidden="true"
          >
            <CheckCircle2 className="w-8 h-8" />
          </span>
          <p role="status" className="text-lg font-bold text-slate-900">
            {tr("{n} productos actualizados", { n: result.updated })}
            {result.archived > 0 &&
              ` · ${tr("{n} archivados", { n: result.archived })}`}
            {result.restored > 0 &&
              ` · ${tr("{n} restaurados", { n: result.restored })}`}
          </p>
          {result.errors.length > 0 && (
            <div className="text-left rounded-2xl bg-red-50 p-4 space-y-2 max-w-2xl mx-auto">
              <ul className="text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e) => (
                  <li key={e.id}>
                    {names.get(e.id) ?? e.id}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={onClose}>{tr("Listo")}</Button>
        </div>
      ) : loadError ? (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium"
        >
          {loadError instanceof Error
            ? loadError.message
            : tr("No se pudieron cargar los productos")}
        </p>
      ) : !rows ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          {tr("Ningún producto coincide con los filtros.")}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            {tr(
              "Edita las celdas directo en la tabla o marca varias filas y aplica un cambio a todas. Nada se guarda hasta que confirmes.",
            )}
          </p>
          {truncated && (
            <p className="rounded-2xl bg-mango-50 text-mango-800 px-4 py-2.5 text-sm font-medium">
              {tr(
                "Se muestran los primeros {n} productos; usa la búsqueda o la categoría para elegir los demás.",
                {
                  n: MAX_PRODUCTS,
                },
              )}
            </p>
          )}

          <fieldset className="rounded-2xl bg-slate-100 p-3 sm:p-4 space-y-3">
            <legend className="sr-only">{tr("Cambiar varios a la vez")}</legend>
            <p className="text-sm font-semibold text-slate-900">
              {tr("Cambiar varios a la vez")}{" "}
              <span className="font-normal text-slate-600">
                ·{" "}
                {selected.size === 1
                  ? tr("1 seleccionado")
                  : tr("{n} seleccionados", { n: selected.size })}
              </span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
              <Select
                label={tr("Qué cambiar")}
                value={field}
                onChange={(e) =>
                  setField(e.target.value as BulkEditNumber | "categoryId")
                }
              >
                <option value="price">{tr("Precio")}</option>
                <option value="cost">{tr("Costo")}</option>
                <option value="wholesalePrice">{tr("Precio mayoreo")}</option>
                <option value="minStock">{tr("Stock mínimo")}</option>
                <option value="categoryId">{tr("Categoría")}</option>
              </Select>
              {numberField ? (
                <>
                  <Select
                    label={tr("Cómo")}
                    value={op}
                    onChange={(e) => setOp(e.target.value as AdjustOp)}
                  >
                    <option value="up%">{tr("Subir %")}</option>
                    <option value="down%">{tr("Bajar %")}</option>
                    <option value="add">{tr("Sumar")}</option>
                    <option value="sub">{tr("Restar")}</option>
                    <option value="set">{tr("Fijar en")}</option>
                  </Select>
                  <Input
                    label={percent ? tr("Porcentaje") : tr("Valor")}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={percent ? "10" : "0.50"}
                  />
                  {field !== "minStock" ? (
                    <Select
                      label={tr("Redondear")}
                      value={rounding}
                      onChange={(e) => setRounding(e.target.value as Rounding)}
                    >
                      <option value="none">{tr("Sin redondear")}</option>
                      <option value="0.05">{tr("A 0.05")}</option>
                      <option value="0.10">{tr("A 0.10")}</option>
                      <option value="0.25">{tr("A 0.25")}</option>
                      <option value="0.50">{tr("A 0.50")}</option>
                      <option value="1">{tr("Al entero")}</option>
                      <option value="99">{tr("Que termine en .99")}</option>
                    </Select>
                  ) : (
                    <span className="hidden lg:block" />
                  )}
                </>
              ) : (
                <div className="lg:col-span-3">
                  <Select
                    label={tr("Nueva categoría")}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">{tr("Sin categoría")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <Button onClick={applyToSelected} disabled={selected.size === 0}>
                {tr("Aplicar a los seleccionados")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.archived ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setArchived(false)}
                  disabled={selected.size === 0}
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />{" "}
                  {tr("Restaurar seleccionados")}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setArchived(true)}
                  disabled={selected.size === 0}
                >
                  <Archive className="w-4 h-4" aria-hidden="true" />{" "}
                  {tr("Archivar seleccionados")}
                </Button>
              )}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2" role="status">
            <Badge tone="gray">
              {rows.length === 1
                ? tr("1 producto")
                : tr("{n} productos", { n: rows.length })}
            </Badge>
            <Badge tone="blue" dot>
              {changed === 1
                ? tr("1 con cambios")
                : tr("{n} con cambios", { n: changed })}
            </Badge>
            {invalid > 0 && (
              <Badge tone="red" dot>
                {tr("{n} con errores", { n: invalid })}
              </Badge>
            )}
          </div>

          <div
            className="overflow-auto max-h-[48vh] rounded-2xl border border-slate-200"
            tabIndex={0}
            role="region"
            aria-label={tr("Tabla de productos")}
          >
            <table className="text-sm border-separate border-spacing-0 min-w-full">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-semibold text-slate-700">
                <tr>
                  <th scope="col" className="px-2 py-2 w-10">
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded accent-brand-600"
                      aria-label={tr("Seleccionar todos")}
                      checked={allSelected}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(rows.map((r) => r.product.id)),
                        )
                      }
                    />
                  </th>
                  <th scope="col" className="px-2 py-2 min-w-56">
                    {tr("Producto")}
                  </th>
                  <th scope="col" className="px-2 py-2 min-w-40">
                    {tr("Categoría")}
                  </th>
                  {(["cost", "price"] as const).map((f) => (
                    <th key={f} scope="col" className="px-2 py-2 min-w-28">
                      {tr(NUMBER_LABELS[f])}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 min-w-20 text-right">
                    {tr("Margen")}
                  </th>
                  {(["wholesalePrice", "minStock"] as const).map((f) => (
                    <th key={f} scope="col" className="px-2 py-2 min-w-28">
                      {tr(NUMBER_LABELS[f])}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 min-w-40">
                    {tr("Estado")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const id = r.product.id;
                  const patch = patches[i];
                  const bad = errors[i];
                  const margin = marginPercent(
                    cellNumber(r.price),
                    cellNumber(r.cost),
                  );
                  const cell = (f: TextField) => {
                    const original =
                      f === "name"
                        ? r.product.name
                        : numberText(
                            f === "cost" ? (r.product.cost ?? 0) : r.product[f],
                          );
                    const dirty = patch != null && f in patch;
                    const wrong = cellError(r, f) !== null;
                    return (
                      <td key={f} className="p-1 border-t border-slate-100">
                        <input
                          value={r[f]}
                          onChange={(e) => update(i, { [f]: e.target.value })}
                          inputMode={f === "name" ? undefined : "decimal"}
                          aria-label={tr("{col} de {name}", {
                            col: tr(f === "name" ? "Nombre" : NUMBER_LABELS[f]),
                            name: r.product.name,
                          })}
                          aria-invalid={wrong || undefined}
                          title={
                            dirty
                              ? tr("Antes: {value}", { value: original || "—" })
                              : undefined
                          }
                          className={cn(
                            "w-full min-h-10 px-2.5 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-600/15 focus:border-brand-600",
                            f !== "name" && "tabular-nums",
                            wrong
                              ? "border-red-500 bg-red-50"
                              : dirty
                                ? "border-mango-500 bg-mango-50"
                                : "border-slate-200 bg-surface hover:border-slate-400",
                          )}
                        />
                      </td>
                    );
                  };
                  return (
                    <tr
                      key={id}
                      className={cn(
                        selected.has(id) &&
                          "[&>td:first-child]:shadow-[inset_4px_0_0_var(--color-brand-600)]",
                      )}
                    >
                      <td className="px-2 py-1 border-t border-slate-100">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded accent-brand-600"
                          aria-label={tr("Seleccionar {name}", {
                            name: r.product.name,
                          })}
                          checked={selected.has(id)}
                          onChange={() => toggle(id)}
                        />
                      </td>
                      {cell("name")}
                      <td className="p-1 border-t border-slate-100">
                        <select
                          value={r.categoryId}
                          onChange={(e) =>
                            update(i, { categoryId: e.target.value })
                          }
                          aria-label={tr("{col} de {name}", {
                            col: tr("Categoría"),
                            name: r.product.name,
                          })}
                          className={cn(
                            "w-full min-h-10 px-2 rounded-lg border text-sm text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-600/15 focus:border-brand-600",
                            patch && "categoryId" in patch
                              ? "border-mango-500 bg-mango-50"
                              : "border-slate-200 bg-surface",
                          )}
                        >
                          <option value="">{tr("Sin categoría")}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {cell("cost")}
                      {cell("price")}
                      <td
                        className={cn(
                          "px-2 py-1 border-t border-slate-100 text-right tabular-nums font-semibold",
                          margin !== null && margin < 0
                            ? "text-red-700"
                            : "text-slate-700",
                        )}
                      >
                        {margin === null ? "—" : `${fmt.number(margin)}%`}
                      </td>
                      {cell("wholesalePrice")}
                      {cell("minStock")}
                      <td className="px-2 py-1 border-t border-slate-100">
                        {bad ? (
                          <span className="inline-flex items-start gap-1 text-red-700 font-medium">
                            <XCircle
                              className="w-4 h-4 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                            {tr(
                              bad.field === "name"
                                ? "Nombre"
                                : NUMBER_LABELS[bad.field],
                            )}
                            : {tr(bad.error)}
                          </span>
                        ) : patch && "archived" in patch ? (
                          <span className="font-semibold text-mango-800">
                            {r.archived
                              ? tr("Se archivará")
                              : tr("Se restaurará")}
                          </span>
                        ) : patch ? (
                          <span className="font-semibold text-mango-800">
                            {tr("Con cambios")}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={onClose}>
              {tr("Cancelar")}
            </Button>
            <Button
              onClick={save}
              loading={saving}
              disabled={changed === 0 || invalid > 0}
            >
              {changed === 1
                ? tr("Guardar cambios en 1 producto")
                : tr("Guardar cambios en {n} productos", { n: changed })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
