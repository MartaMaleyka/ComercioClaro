"use client";

import { useEffect, useState } from "react";
import { Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  cost: number;
}

interface Purchase {
  id: string;
  total: number;
  supplier: string | null;
  notes: string | null;
  createdAt: string;
  items: {
    product: { name: string };
    quantity: number;
    unitCost: number;
    subtotal: number;
  }[];
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const [purchasesRes, productsRes] = await Promise.all([
      fetch(`/api/purchases?search=${search}`),
      fetch("/api/products"),
    ]);
    setPurchases(await purchasesRes.json());
    setProducts(await productsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [search]);

  function addToCart(product: Product) {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.productId === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitCost: product.cost,
        },
      ]);
    }
  }

  function updateCartItem(
    productId: string,
    field: "quantity" | "unitCost",
    value: number
  ) {
    setCart(
      cart.map((c) =>
        c.productId === productId ? { ...c, [field]: value } : c
      )
    );
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter((c) => c.productId !== productId));
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.unitCost * c.quantity,
    0
  );

  async function handleSave() {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitCost: c.unitCost,
          })),
          supplier,
          notes,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        setCart([]);
        setSupplier("");
        setNotes("");
        loadData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta compra? El inventario se ajustará.")) return;
    await fetch(`/api/purchases/${id}`, { method: "DELETE" });
    loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
          <p className="text-sm text-slate-600">Registra tus compras a proveedores</p>
        </div>
        <Button onClick={() => setModalOpen(true)} size="sm">
          <Plus className="w-4 h-4" />
          Nueva
        </Button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar compras..."
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : purchases.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Sin compras registradas"
          description="Registra lo que compras para mantener tu inventario actualizado"
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Registrar compra
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {purchases.map((purchase) => (
            <Card key={purchase.id}>
              <CardContent className="!py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {purchase.items
                        .map((i) => `${i.product.name} (×${i.quantity})`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateTime(purchase.createdAt)}
                      {purchase.supplier && ` · ${purchase.supplier}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="font-bold text-slate-900">
                      {formatCurrency(purchase.total)}
                    </span>
                    <button
                      onClick={() => handleDelete(purchase.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva compra">
        <div className="space-y-4">
          <Input
            label="Proveedor (opcional)"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Nombre del proveedor"
          />

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Agregar productos</p>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded-lg text-sm transition-colors"
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="text-slate-500">
                    Costo: {formatCurrency(p.cost)}
                  </span>
                </button>
              ))}
              {products.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Primero agrega productos en Inventario
                </p>
              )}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="space-y-2">
              {cart.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center gap-2 bg-slate-50 rounded-xl p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateCartItem(
                        item.productId,
                        "quantity",
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-14 px-2 py-1 text-center border border-slate-200 rounded-lg text-sm"
                    placeholder="Cant."
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitCost}
                    onChange={(e) =>
                      updateCartItem(
                        item.productId,
                        "unitCost",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-20 px-2 py-1 text-center border border-slate-200 rounded-lg text-sm"
                    placeholder="Costo"
                  />
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="p-1 hover:bg-red-50 rounded text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold text-slate-900">
                  {formatCurrency(cartTotal)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              rows={2}
            />
          </div>

          <Button
            onClick={handleSave}
            className="w-full"
            loading={saving}
            disabled={cart.length === 0}
          >
            Registrar compra
          </Button>
        </div>
      </Modal>
    </div>
  );
}
