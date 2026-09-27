"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { Product } from "@/lib/client/types";
import { UNIT_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

export interface RecipeDraft {
  recipeYield: string;
  items: { key: string; ingredientId: string; quantity: string }[];
}

export interface RecipeData {
  recipeYield: number | null;
  items: { ingredientId: string; quantity: number }[];
}

export function recipeDraft(data: RecipeData | null | undefined): RecipeDraft {
  return {
    recipeYield: data?.recipeYield ? String(data.recipeYield) : "",
    items: (data?.items ?? []).map((i) => ({
      key: i.ingredientId,
      ingredientId: i.ingredientId,
      quantity: String(i.quantity),
    })),
  };
}

const num = (v: string) => Number(v.replace(",", "."));

/** Cuerpo para guardar la receta (solo renglones completos). */
export function recipeBody(draft: RecipeDraft) {
  return {
    recipeYield: draft.recipeYield ? num(draft.recipeYield) : null,
    items: draft.items
      .filter((i) => i.ingredientId && num(i.quantity) > 0)
      .map((i) => ({ ingredientId: i.ingredientId, quantity: num(i.quantity) })),
  };
}

/**
 * Editor de receta: insumos con su cantidad (en la unidad del insumo) y las porciones que rinde.
 * Muestra el costo por plato con el costo actual de los insumos y el margen contra el precio.
 */
export function RecipeEditor({
  productId,
  price,
  initial,
  onChange,
}: {
  productId: string | null;
  price: number;
  initial: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
}) {
  const tr = useText();
  const fmt = useFormat();
  const [draft, setDraft] = useState(initial);
  const { data: catalog } = useSWR<{ items: Product[] }>("/api/products?all=true", fetcher);
  // Solo productos con existencias y sin receta propia pueden ser insumos.
  const options = (catalog?.items ?? []).filter((p) => p.id !== productId && p.trackStock !== false);
  const ingredients = options.filter((p) => p.isIngredient);
  const others = options.filter((p) => !p.isIngredient);
  const byId = new Map(options.map((p) => [p.id, p]));

  const update = (next: RecipeDraft) => {
    setDraft(next);
    onChange(next);
  };
  const setItem = (index: number, patch: Partial<RecipeDraft["items"][number]>) =>
    update({ ...draft, items: draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });

  const portions = num(draft.recipeYield) > 0 ? num(draft.recipeYield) : 1;
  const cost = draft.items.reduce((acc, i) => {
    const product = byId.get(i.ingredientId);
    const quantity = num(i.quantity);
    return product && quantity > 0 ? acc + (quantity / portions) * (product.cost ?? 0) : acc;
  }, 0);
  const hasItems = draft.items.some((i) => i.ingredientId && num(i.quantity) > 0);
  const margin = price > 0 && hasItems ? Math.round(((price - cost) / price) * 1000) / 10 : null;

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-100 p-3">
      <legend className="text-sm font-medium text-slate-700 px-1">{tr("Receta (insumos por plato)")}</legend>
      <p className="text-xs text-slate-500">
        {tr("Al vender este producto se descuentan sus insumos en lugar de su propia existencia.")}
      </p>
      <Input
        label={tr("Porciones que rinde la receta")}
        inputMode="decimal"
        value={draft.recipeYield}
        onChange={(e) => update({ ...draft, recipeYield: e.target.value })}
        placeholder="1"
        hint={tr("Escribe las cantidades de la receta completa; se dividen entre las porciones")}
      />
      {draft.items.map((item, i) => {
        const product = byId.get(item.ingredientId);
        const unit = product ? (UNIT_LABELS[product.unit] ?? product.unit) : "";
        return (
          <div key={item.key} className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
            <Select
              label={tr("Insumo")}
              value={item.ingredientId}
              onChange={(e) => setItem(i, { ingredientId: e.target.value })}
            >
              <option value="">{tr("Elige un insumo")}</option>
              {ingredients.length > 0 && (
                <optgroup label={tr("Insumos")}>
                  {ingredients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={tr("Otros productos")}>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </Select>
            <Input
              label={unit ? tr("Cantidad ({unit})", { unit }) : tr("Cantidad")}
              inputMode="decimal"
              value={item.quantity}
              onChange={(e) => setItem(i, { quantity: e.target.value })}
            />
            <button
              type="button"
              aria-label={tr("Quitar {name}", { name: product?.name ?? tr("Insumo") })}
              onClick={() => update({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
              className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          update({
            ...draft,
            items: [...draft.items, { key: crypto.randomUUID().slice(0, 8), ingredientId: "", quantity: "" }],
          })
        }
      >
        <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar insumo")}
      </Button>
      {hasItems && (
        <p className="text-sm text-slate-700" aria-live="polite">
          {tr("Costo por plato: {cost}", { cost: fmt.money(cost) })}
          {margin !== null && ` · ${tr("Margen {n}%", { n: margin })}`}
        </p>
      )}
    </fieldset>
  );
}
