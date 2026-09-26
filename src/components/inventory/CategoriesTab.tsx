"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pencil, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import type { Category } from "@/lib/client/types";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

export function CategoriesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Category[]>("/api/categories", fetcher);
  const [name, setName] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/categories", { body: { name } });
      setName("");
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function rename(c: Category) {
    const value = await confirm({ title: "Renombrar categoría", inputLabel: "Nombre", confirmLabel: "Guardar" });
    if (typeof value !== "string") return;
    try {
      await api(`/api/categories/${c.id}`, { method: "PUT", body: { name: value } });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove(c: Category) {
    const ok = await confirm({
      title: `Eliminar ${c.name}`,
      message: "Los productos de esta categoría quedarán sin categoría.",
      danger: true,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    try {
      await api(`/api/categories/${c.id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <form onSubmit={add} className="flex gap-2 items-end">
        <div className="flex-1">
          <Input label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <Button type="submit">Agregar</Button>
      </form>
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-2">
          {data.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="text-slate-900">
                  {c.name} <span className="text-xs text-slate-500">({c._count?.products ?? 0})</span>
                </span>
                <span className="flex gap-1">
                  <button aria-label={`Renombrar ${c.name}`} onClick={() => rename(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button aria-label={`Eliminar ${c.name}`} onClick={() => remove(c)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
