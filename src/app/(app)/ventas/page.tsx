"use client";

import { useEffect, useState } from "react";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface SaleItem {
  productId: string;
  product: { name: string };
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Sale {
  id: string;
  total: number;
  notes: string | null;
  createdAt: string;
  items: SaleItem[];
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  stock: number;
}

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const [salesRes, productsRes] = await Promise.all([
      fetch(`/api/sales?search=${search}`),
      fetch("/api/products"),
    ]);
    setSales(await salesRes.json());
    setProducts(await productsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [search]);

  function addToCart(product: Product) {
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) return;
      setCart(
        cart.map((c) =>
          c.productId === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      );
    } else {
      if (product.stock < 1) return;
      setCart([
        ...cart,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
          stock: product.stock,
        },
      ]);
    }
  }

  function updateCartQty(productId: string, qty: number) {
    setCart(
      cart
        .map((c) =>
          c.productId === productId
            ? { ...c, quantity: Math.min(Math.max(1, qty), c.stock) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter((c) => c.productId !== productId));
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.unitPrice * c.quantity,
    0
  );

  async function handleSave() {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
          })),
          notes,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        setCart([]);
        setNotes("");
        loadData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta venta? El inventario se restaurará.")) return;
    await fetch(`/api/sales/${id}`, { method: "DELETE" });
    loadData();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="text-sm text-slate-600">Registra y consulta tus ventas</p>
        </div>
        <Button onClick={() => setModalOpen(true)} size="sm">
          <Plus className="w-4 h-4" />
          Nueva
        </Button>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar ventas..."
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sin ventas aún"
          description="Registra tu primera venta para empezar a llevar el control"
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Registrar venta
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <Card key={sale.id}>
              <CardContent className="!py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {sale.items.map((i) => `${i.product.name} (×${i.quantity})`).join(", ")}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateTime(sale.createdAt)}
                    </p>
                    {sale.notes && (
                      <p className="text-xs text-slate-400 mt-1">{sale.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="font-bold text-brand-600">
                      {formatCurrency(sale.total)}
                    </span>
                    <button
                      onClick={() => handleDelete(sale.id)}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva venta">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Agregar productos</p>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
              {products.filter((p) => p.stock > 0).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 rounded-lg text-sm transition-colors"
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="text-slate-500">
                    {formatCurrency(p.price)} · Stock: {p.stock}
                  </span>
                </button>
              ))}
              {products.filter((p) => p.stock > 0).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  No hay productos con stock disponible
                </p>
              )}
            </div>
          </div>

          {cart.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Carrito</p>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-2 bg-slate-50 rounded-xl p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(item.unitPrice)} c/u
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={item.stock}
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartQty(item.productId, parseInt(e.target.value) || 1)
                      }
                      className="w-14 px-2 py-1 text-center border border-slate-200 rounded-lg text-sm"
                    />
                    <span className="text-sm font-medium text-slate-900 w-20 text-right">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1 hover:bg-red-50 rounded text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="text-lg font-bold text-brand-600">
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
              placeholder="Ej: Cliente frecuente, pago en efectivo..."
            />
          </div>

          <Button
            onClick={handleSave}
            className="w-full"
            loading={saving}
            disabled={cart.length === 0}
          >
            Registrar venta
          </Button>
        </div>
      </Modal>
    </div>
  );
}
