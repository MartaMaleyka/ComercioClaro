"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, History, Package, Pencil, Plus, RotateCcw, SlidersHorizontal, Archive, Upload } from "lucide-react";
import useSWR from "swr";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useDebounce, usePaginated } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import type { Category, Product } from "@/lib/client/types";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Checkbox, Select } from "@/components/ui/Input";
import { ErrorState, ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";
import { ProductForm } from "@/components/inventory/ProductForm";
import { AdjustStockModal } from "@/components/inventory/AdjustStockModal";
import { MovementsModal } from "@/components/inventory/MovementsModal";
import { ReorderTab } from "@/components/inventory/ReorderTab";
import { ExpiringTab } from "@/components/inventory/ExpiringTab";
import { CategoriesTab } from "@/components/inventory/CategoriesTab";
import { CountTab } from "@/components/inventory/CountTab";
import { LabelsTab } from "@/components/inventory/LabelsTab";

type Tab = "productos" | "reabastecer" | "caducidad" | "conteo" | "etiquetas" | "categorias" | "importar";

export default function InventoryPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Inventory />
    </Suspense>
  );
}

function Inventory() {
  const { role } = useSession();
  const isOwner = role === "OWNER";
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "productos";
  const setTab = (t: Tab) => router.replace(t === "productos" ? "/inventario" : `/inventario?tab=${t}`);

  const tabs: { value: Tab; label: string }[] = [
    { value: "productos", label: "Productos" },
    ...(isOwner ? [{ value: "reabastecer" as Tab, label: "Qué comprar" }] : []),
    { value: "caducidad", label: "Caducidad" },
    ...(isOwner
      ? [
          { value: "conteo" as Tab, label: "Conteo físico" },
          { value: "etiquetas" as Tab, label: "Etiquetas" },
          { value: "categorias" as Tab, label: "Categorías" },
          { value: "importar" as Tab, label: "Importar / exportar" },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Inventario" description="Productos, existencias y alertas" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "productos" && <ProductsTab />}
      {tab === "reabastecer" && isOwner && <ReorderTab />}
      {tab === "caducidad" && <ExpiringTab />}
      {tab === "conteo" && isOwner && <CountTab />}
      {tab === "etiquetas" && isOwner && <LabelsTab />}
      {tab === "categorias" && isOwner && <CategoriesTab />}
      {tab === "importar" && isOwner && <ImportExportTab />}
    </div>
  );
}

function ProductsTab() {
  const { role } = useSession();
  const isOwner = role === "OWNER";
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [archived, setArchived] = useState(false);
  const debounced = useDebounce(search);
  const { data: categories } = useSWR<Category[]>("/api/categories", fetcher);
  const list = usePaginated<Product>("/api/products", {
    search: debounced,
    categoryId,
    lowStock: lowStock || undefined,
    archived: archived || undefined,
  });

  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [kardex, setKardex] = useState<Product | null>(null);

  async function archive(p: Product) {
    const ok = await confirm({
      title: `Archivar ${p.name}`,
      message: "Dejará de aparecer en el catálogo, pero se conserva su historial de ventas y compras.",
      confirmLabel: "Archivar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/products/${p.id}`, { method: "DELETE" });
      toast.success("Producto archivado");
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function restore(p: Product) {
    try {
      await api(`/api/products/${p.id}`, { method: "PUT", body: { archived: false } });
      toast.success("Producto restaurado");
      list.mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, código o SKU" />
        </div>
        <Select aria-label="Categoría" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-auto">
          <option value="">Todas las categorías</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {isOwner && (
          <Button onClick={() => setEditing(null)}>
            <Plus className="w-4 h-4" /> Producto
          </Button>
        )}
      </div>
      <div className="flex gap-4">
        <Checkbox label="Solo bajo inventario" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
        {isOwner && <Checkbox label="Ver archivados" checked={archived} onChange={(e) => setArchived(e.target.checked)} />}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.mutate()} />
      ) : list.isLoading ? (
        <ListSkeleton />
      ) : list.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin productos"
          description={search || lowStock ? "Ningún producto coincide con los filtros." : "Agrega tu primer producto o importa tu catálogo desde Excel."}
          action={isOwner && !search && <Button onClick={() => setEditing(null)}>Agregar producto</Button>}
        />
      ) : (
        <div className="space-y-2">
          {list.items.map((p) => {
            const low = p.stock <= p.minStock;
            return (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {fmt.money(p.price)}
                      {p.unit !== "PIECE" && ` / ${fmt.qty(1, p.unit).replace("1 ", "")}`}
                      {isOwner && p.cost !== undefined && ` · costo ${fmt.money(p.cost)}`}
                      {p.barcode && ` · ${p.barcode}`}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {p.category && <Badge>{p.category.name}</Badge>}
                      {low && <Badge tone={p.stock <= 0 ? "red" : "amber"}>{p.stock <= 0 ? "Agotado" : "Bajo"}</Badge>}
                      {p.wholesalePrice != null && <Badge tone="blue">Mayoreo</Badge>}
                      {p.trackExpiry && <Badge tone="purple">Caducidad</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold tabular-nums ${low ? "text-amber-600" : "text-slate-900"}`}>{fmt.qty(p.stock, p.unit)}</p>
                    <p className="text-xs text-slate-500">mín. {fmt.number(p.minStock)}</p>
                    {isOwner && (
                      <div className="flex gap-0.5 justify-end mt-1">
                        {archived ? (
                          <IconButton label="Restaurar" onClick={() => restore(p)} icon={RotateCcw} />
                        ) : (
                          <>
                            <IconButton label="Ajustar existencia" onClick={() => setAdjusting(p)} icon={SlidersHorizontal} />
                            <IconButton label="Movimientos" onClick={() => setKardex(p)} icon={History} />
                            <IconButton label="Editar" onClick={() => setEditing(p)} icon={Pencil} />
                            <IconButton label="Archivar" onClick={() => archive(p)} icon={Archive} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}

      <ProductForm
        open={editing !== undefined}
        product={editing ?? null}
        categories={categories ?? []}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          list.mutate();
        }}
      />
      <AdjustStockModal
        product={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          setAdjusting(null);
          list.mutate();
        }}
      />
      <MovementsModal product={kardex} onClose={() => setKardex(null)} />
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Pencil }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
      <Icon className="w-4 h-4" />
    </button>
  );
}

function ImportExportTab() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; error: string }[] } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<typeof result>("/api/products/import", { body: form });
      setResult(res);
      toast.success("Importación terminada");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const template =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(
      "﻿Nombre,Código de barras,Categoría,Unidad,Precio,Costo,Existencia,Stock mínimo,IVA\nCoca-Cola 600ml,7501055300075,Bebidas,pza,18,12,24,6,16\nFrijol negro,,Granel,kg,38,26,20,5,0\n"
    );

  const exports = [
    { type: "products", label: "Productos" },
    { type: "sales", label: "Ventas" },
    { type: "sale-items", label: "Detalle de ventas" },
    { type: "purchases", label: "Compras" },
    { type: "expenses", label: "Gastos" },
    { type: "customers", label: "Clientes" },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4" aria-hidden="true" /> Importar productos (CSV / Excel)
          </h2>
          <p className="text-sm text-slate-600">
            Guarda tu hoja de Excel como CSV. Columnas reconocidas: Nombre, Código de barras, SKU, Categoría, Unidad (pza, kg, l),
            Precio, Precio mayoreo, Mayoreo desde, Costo, Existencia, Stock mínimo, IVA, IEPS. Si el código de barras (o el nombre)
            ya existe se actualiza el producto.
          </p>
          <a href={template} download="plantilla-productos.csv" className="text-sm text-brand-700 dark:text-brand-300 underline">
            Descargar plantilla
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Archivo CSV"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
          />
          <Button onClick={upload} loading={busy} disabled={!file}>
            Importar
          </Button>
          {result && (
            <div className="text-sm space-y-1">
              <p className="text-brand-700 dark:text-brand-300">
                {result.created} creados · {result.updated} actualizados
              </p>
              {result.errors.length > 0 && (
                <ul className="text-red-600 text-xs space-y-0.5 max-h-40 overflow-y-auto">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Fila {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Download className="w-4 h-4" aria-hidden="true" /> Exportar y respaldar
          </h2>
          <p className="text-sm text-slate-600">Descarga tu información en CSV (se abre en Excel) o un respaldo completo.</p>
          <div className="grid grid-cols-2 gap-2">
            {exports.map((e) => (
              <a
                key={e.type}
                href={withQuery(`/api/export/${e.type}`, {})}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 text-center"
              >
                {e.label}
              </a>
            ))}
          </div>
          <a href="/api/export/backup" download className="block text-center px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
            Descargar respaldo completo (JSON)
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
