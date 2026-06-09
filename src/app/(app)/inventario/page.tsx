"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { formatCurrency } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

const emptyForm = {
  name: "",
  description: "",
  price: "",
  cost: "",
  stock: "",
  minStock: "5",
};

function InventarioContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(
    searchParams.get("lowStock") === "true"
  );
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const params = new URLSearchParams({ search });
    if (lowStockOnly) params.set("lowStock", "true");
    const res = await fetch(`/api/products?${params}`);
    setProducts(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [search, lowStockOnly]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      cost: String(product.cost),
      stock: String(product.stock),
      minStock: String(product.minStock),
    });
    setModalOpen(true);
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost) || 0,
        stock: parseInt(form.stock) || 0,
        minStock: parseInt(form.minStock) || 5,
      };

      const res = await fetch(
        editing ? `/api/products/${editing.id}` : "/api/products",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        setModalOpen(false);
        loadData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="text-sm text-slate-600">
            {products.length} producto{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4" />
          Nuevo
        </Button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar productos..."
      />

      <button
        onClick={() => setLowStockOnly(!lowStockOnly)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
          lowStockOnly
            ? "bg-amber-100 text-amber-800"
            : "bg-white text-slate-600 border border-slate-200"
        }`}
      >
        <AlertTriangle className="w-4 h-4" />
        Solo bajo inventario
      </button>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin productos"
          description="Agrega tus productos para empezar a llevar el control de inventario"
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Agregar producto
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const isLow = product.stock <= product.minStock;
            return (
              <Card
                key={product.id}
                className={isLow ? "border-amber-200" : ""}
              >
                <CardContent className="!py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">
                          {product.name}
                        </p>
                        {isLow && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Bajo
                          </span>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {product.description}
                        </p>
                      )}
                      <div className="flex gap-3 mt-1.5 text-xs text-slate-500">
                        <span>
                          Stock: <strong className="text-slate-700">{product.stock}</strong>
                        </span>
                        <span>Precio: {formatCurrency(product.price)}</span>
                        <span>Costo: {formatCurrency(product.cost)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => openEdit(product)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar producto" : "Nuevo producto"}
      >
        <div className="space-y-4">
          <Input
            label="Nombre"
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
            placeholder="Ej: Coca-Cola 600ml"
            required
          />
          <Input
            label="Descripción (opcional)"
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            placeholder="Detalles del producto"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Precio de venta"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateForm("price", e.target.value)}
              required
            />
            <Input
              label="Costo"
              type="number"
              step="0.01"
              min="0"
              value={form.cost}
              onChange={(e) => updateForm("cost", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Stock actual"
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => updateForm("stock", e.target.value)}
            />
            <Input
              label="Stock mínimo"
              type="number"
              min="0"
              value={form.minStock}
              onChange={(e) => updateForm("minStock", e.target.value)}
            />
          </div>
          <Button onClick={handleSave} className="w-full" loading={saving}>
            {editing ? "Guardar cambios" : "Agregar producto"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function InventarioPage() {
  return (
    <Suspense fallback={<div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />}>
      <InventarioContent />
    </Suspense>
  );
}
