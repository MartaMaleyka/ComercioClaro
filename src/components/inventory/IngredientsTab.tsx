"use client";

import { useText } from "@/lib/client/i18n";
import useSWR from "swr";
import { ChefHat } from "lucide-react";
import { useState } from "react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { Product, Unit } from "@/lib/client/types";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";
import { AdjustStockModal } from "./AdjustStockModal";

interface Overview {
  ingredients: {
    id: string;
    name: string;
    unit: Unit;
    stock: number;
    minStock: number;
    cost: number;
    isIngredient: boolean;
    recipes: number;
    low: boolean;
  }[];
  dishes: {
    id: string;
    name: string;
    price: number;
    cost: number;
    margin: number | null;
    available: number | null;
    ingredients: number;
  }[];
}

/** Insumos (existencia, costo y en cuántas recetas se usan) y platos con su costo y margen. */
export function IngredientsTab() {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Overview>("/api/inventory/ingredients", fetcher);
  const [waste, setWaste] = useState<Product | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  if (data.ingredients.length === 0 && data.dishes.length === 0) {
    return (
      <EmptyState
        icon={ChefHat}
        title={tr("Sin recetas todavía")}
        description={tr(
          "Marca tus insumos (pollo, arroz, aceite) al crearlos y agrega la receta de cada plato desde Editar producto."
        )}
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section aria-labelledby="insumos-title" className="space-y-2">
        <h2 id="insumos-title" className="text-sm font-semibold text-slate-500">
          {tr("Insumos")}
        </h2>
        {data.ingredients.map((i) => (
          <Card key={i.id}>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{i.name}</p>
                <p className="text-xs text-slate-500">
                  {tr("Costo {cost} · en {n} receta(s)", { cost: fmt.money(i.cost), n: i.recipes })}
                </p>
                {i.low && (
                  <Badge tone={i.stock <= 0 ? "red" : "amber"} className="mt-1">
                    {i.stock <= 0 ? tr("Agotado") : tr("Bajo")}
                  </Badge>
                )}
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className={`font-semibold tabular-nums ${i.low ? "text-amber-600" : "text-slate-900"}`}>
                  {fmt.qty(i.stock, i.unit)}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setWaste({ id: i.id, name: i.name, unit: i.unit, stock: i.stock } as Product)}
                >
                  {tr("Registrar merma")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <section aria-labelledby="platos-title" className="space-y-2">
        <h2 id="platos-title" className="text-sm font-semibold text-slate-500">
          {tr("Platos con receta")}
        </h2>
        {data.dishes.length === 0 ? (
          <p className="text-sm text-slate-500">{tr("Agrega la receta de un plato desde Editar producto.")}</p>
        ) : (
          data.dishes.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{d.name}</p>
                  <p className="text-xs text-slate-500">
                    {tr("Precio {price} · costo por plato {cost}", {
                      price: fmt.money(d.price),
                      cost: fmt.money(d.cost),
                    })}
                  </p>
                  {d.available !== null && (
                    <p className="text-xs text-slate-500">
                      {tr("Alcanza para {n} platos", { n: fmt.number(d.available, 0) })}
                    </p>
                  )}
                </div>
                {d.margin !== null && (
                  <Badge tone={d.margin < 30 ? "amber" : "green"}>{tr("Margen {n}%", { n: d.margin })}</Badge>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
      <AdjustStockModal
        product={waste}
        initialReason="WASTE"
        onClose={() => setWaste(null)}
        onSaved={() => {
          setWaste(null);
          mutate();
        }}
      />
    </div>
  );
}
