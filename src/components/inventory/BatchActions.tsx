"use client";

import { useState } from "react";
import { Archive, ArrowRight, DollarSign, FolderInput, Gauge, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useFormat } from "@/lib/client/format";
import type { Category, Product } from "@/lib/client/types";
import { batchPrice, type PriceMode, type ProductBatchAction } from "@/lib/product-batch";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

type Editing = "price" | "category" | "minStock" | null;

/** Barra que aparece al elegir productos: cambia precio, categoría o stock mínimo, o archiva, de una vez. */
export function BatchBar({
  selected,
  archivedView,
  categories,
  onClear,
  onDone,
}: {
  selected: Product[];
  archivedView: boolean;
  categories: Category[];
  onClear: () => void;
  onDone: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const n = selected.length;

  async function run(action: ProductBatchAction, message: string) {
    setBusy(true);
    try {
      await api("/api/products/batch", { body: { ids: selected.map((p) => p.id), action } });
      toast.success(message);
      setEditing(null);
      onClear();
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    const ok = await confirm({
      title: tr("Archivar {n} productos", { n }),
      message: tr("Dejarán de aparecer en el catálogo, pero se conserva su historial de ventas y compras."),
      confirmLabel: tr("Archivar"),
      danger: true,
    });
    if (ok) await run({ type: "archive" }, tr("{n} productos archivados", { n }));
  }

  if (n === 0) return null;

  return (
    <>
      <div
        role="region"
        aria-label={tr("Acciones en lote")}
        className="sticky bottom-24 md:bottom-4 z-30 rounded-2xl bg-ink text-white shadow-lg border border-ink-line px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-1"
      >
        <div className="flex items-center justify-between gap-2 sm:mr-auto">
          <p className="font-semibold text-sm px-2" role="status">
            {tr("{n} seleccionados", { n })}
          </p>
          <button
            type="button"
            onClick={onClear}
            aria-label={tr("Quitar selección")}
            title={tr("Quitar selección")}
            className="press sm:order-last inline-flex items-center justify-center w-11 h-11 rounded-xl hover:bg-white/10"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className={archivedView ? "flex gap-1" : "grid grid-cols-4 sm:flex gap-1"}>
          {archivedView ? (
            <BarButton
              icon={RotateCcw}
              label={tr("Restaurar")}
              disabled={busy}
              onClick={() => run({ type: "restore" }, tr("{n} productos restaurados", { n }))}
            />
          ) : (
            <>
              <BarButton icon={DollarSign} label={tr("Precio")} onClick={() => setEditing("price")} />
              <BarButton icon={FolderInput} label={tr("Categoría")} onClick={() => setEditing("category")} />
              <BarButton icon={Gauge} label={tr("Stock mínimo")} onClick={() => setEditing("minStock")} />
              <BarButton icon={Archive} label={tr("Archivar")} disabled={busy} onClick={archive} />
            </>
          )}
        </div>
      </div>

      {editing === "price" && (
        <PriceModal selected={selected} busy={busy} onClose={() => setEditing(null)} onSave={run} />
      )}
      {editing === "category" && (
        <CategoryModal
          n={n}
          categories={categories}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={run}
        />
      )}
      {editing === "minStock" && (
        <MinStockModal n={n} busy={busy} onClose={() => setEditing(null)} onSave={run} />
      )}
    </>
  );
}

function BarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-h-11 px-1 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-semibold leading-tight text-center hover:bg-white/10 disabled:opacity-60"
    >
      <Icon className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );
}

type Save = (action: ProductBatchAction, message: string) => Promise<void>;

function PriceModal({
  selected,
  busy,
  onClose,
  onSave,
}: {
  selected: Product[];
  busy: boolean;
  onClose: () => void;
  onSave: Save;
}) {
  const tr = useText();
  const fmt = useFormat();
  const [mode, setMode] = useState<PriceMode>("percent");
  const [value, setValue] = useState("");
  const n = selected.length;
  const amount = Number(value);
  const ready = value.trim() !== "" && Number.isFinite(amount) && (mode === "set" ? amount >= 0 : amount !== 0);
  const preview = selected.map((p) => ({ p, next: ready ? batchPrice(p.price, mode, amount) : p.price }));
  const invalid = ready && mode !== "set" ? preview.filter((x) => x.next <= 0) : [];

  return (
    <Modal open onClose={onClose} title={tr("Cambiar el precio de {n} productos", { n })}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && invalid.length === 0) onSave({ type: "price", mode, value: amount }, tr("Precios actualizados"));
        }}
      >
        <Select label={tr("Cómo cambiar el precio")} value={mode} onChange={(e) => setMode(e.target.value as PriceMode)}>
          <option value="percent">{tr("Subir o bajar un porcentaje")}</option>
          <option value="amount">{tr("Sumar o restar un monto")}</option>
          <option value="set">{tr("Poner el mismo precio a todos")}</option>
        </Select>
        <Input
          label={mode === "percent" ? tr("Porcentaje") : mode === "amount" ? tr("Monto") : tr("Precio nuevo")}
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hint={mode === "set" ? undefined : tr("Usa un número negativo para bajar (por ejemplo -10)")}
          required
          autoFocus
        />
        <div className="rounded-2xl border border-slate-200 max-h-56 overflow-y-auto" tabIndex={0} role="region" aria-label={tr("Vista previa")}>
          <ul className="divide-y divide-slate-100 text-sm">
            {preview.slice(0, 50).map(({ p, next }) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate text-slate-800">{p.name}</span>
                <span className="shrink-0 tabular-nums flex items-center gap-1.5">
                  <span className="text-slate-500">{fmt.money(p.price)}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">{tr("pasa a")}</span>
                  <span className={next <= 0 && mode !== "set" ? "font-semibold text-red-700" : "font-semibold text-slate-900"}>
                    {fmt.money(next)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {n > 50 && <p className="text-xs text-slate-500">{tr("Se muestran los primeros 50.")}</p>}
        {invalid.length > 0 && (
          <p role="alert" className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
            {tr("El precio quedaría en cero o menos en {n} productos", { n: invalid.length })}
          </p>
        )}
        <Button type="submit" className="w-full" loading={busy} disabled={!ready || invalid.length > 0}>
          {tr("Cambiar {n} precios", { n })}
        </Button>
      </form>
    </Modal>
  );
}

function CategoryModal({
  n,
  categories,
  busy,
  onClose,
  onSave,
}: {
  n: number;
  categories: Category[];
  busy: boolean;
  onClose: () => void;
  onSave: Save;
}) {
  const tr = useText();
  const [categoryId, setCategoryId] = useState("");
  return (
    <Modal open onClose={onClose} title={tr("Cambiar la categoría de {n} productos", { n })}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ type: "category", categoryId: categoryId || null }, tr("Categoría actualizada"));
        }}
      >
        <Select label={tr("Categoría nueva")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{tr("Sin categoría")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" className="w-full" loading={busy}>
          {tr("Mover {n} productos", { n })}
        </Button>
      </form>
    </Modal>
  );
}

function MinStockModal({ n, busy, onClose, onSave }: { n: number; busy: boolean; onClose: () => void; onSave: Save }) {
  const tr = useText();
  const [value, setValue] = useState("");
  const amount = Number(value);
  const ready = value.trim() !== "" && Number.isFinite(amount) && amount >= 0;
  return (
    <Modal open onClose={onClose} title={tr("Cambiar el stock mínimo de {n} productos", { n })}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSave({ type: "minStock", value: amount }, tr("Stock mínimo actualizado"));
        }}
      >
        <Input
          label={tr("Stock mínimo")}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hint={tr("Cuando la existencia llegue a este número, el producto aparece como bajo.")}
          required
          autoFocus
        />
        <Button type="submit" className="w-full" loading={busy} disabled={!ready}>
          {tr("Guardar para {n} productos", { n })}
        </Button>
      </form>
    </Modal>
  );
}
