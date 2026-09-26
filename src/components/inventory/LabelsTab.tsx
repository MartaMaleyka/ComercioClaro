"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Barcode, Printer } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import type { Product } from "@/lib/client/types";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { SearchBar } from "@/components/ui/SearchBar";
import { ListSkeleton } from "@/components/ui/Misc";

/** Selección de productos para imprimir etiquetas de precio con código de barras. */
export function LabelsTab() {
  const fmt = useFormat();
  const toast = useToast();
  const { data, mutate } = useSWR<{ items: Product[] }>("/api/products?all=true", fetcher);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState("1");
  const [size, setSize] = useState("medium");
  const [busy, setBusy] = useState(false);

  const products = useMemo(
    () => (data?.items ?? []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );
  const withoutCode = products.filter((p) => selected.has(p.id) && !p.barcode && !p.sku);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignCodes() {
    setBusy(true);
    try {
      const res = await api<{ assigned: number }>("/api/products/assign-barcodes", {
        body: { ids: withoutCode.map((p) => p.id) },
      });
      toast.success(`${res.assigned} códigos internos asignados`);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  function print() {
    const ids = [...selected].join(",");
    window.open(`/etiquetas?ids=${ids}&copies=${Number(copies) || 1}&size=${size}`, "_blank");
  }

  if (!data) return <ListSkeleton />;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar producto" />
        <Select aria-label="Tamaño" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="small">Chica 50×25 mm</option>
          <option value="medium">Mediana 62×35 mm</option>
          <option value="shelf">Anaquel 90×40 mm</option>
        </Select>
        <Input
          aria-label="Copias"
          inputMode="numeric"
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
          className="w-20"
        />
        <Button onClick={print} disabled={selected.size === 0}>
          <Printer className="w-4 h-4" /> Imprimir ({selected.size})
        </Button>
      </div>
      <div className="flex gap-3 items-center flex-wrap text-sm">
        <button
          className="underline text-brand-700 dark:text-brand-300"
          onClick={() => setSelected(new Set(products.map((p) => p.id)))}
        >
          Seleccionar todos
        </button>
        <button className="underline text-slate-500" onClick={() => setSelected(new Set())}>
          Quitar selección
        </button>
        {withoutCode.length > 0 && (
          <Button size="sm" variant="secondary" onClick={assignCodes} loading={busy}>
            <Barcode className="w-4 h-4" /> Asignar código interno a {withoutCode.length} sin código
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="divide-y divide-slate-100 py-0">
          {products.map((p) => (
            <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
              <Checkbox label={p.name} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="text-sm text-slate-500 shrink-0">
                {fmt.money(p.price)} · {p.barcode ?? p.sku ?? "sin código"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
