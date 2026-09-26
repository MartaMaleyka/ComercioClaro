"use client";

import { useState } from "react";
import { ScanBarcode } from "lucide-react";
import { api } from "@/lib/client/api";
import type { Category, Product } from "@/lib/client/types";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";

const UNITS = [
  { value: "PIECE", label: "Pieza", sat: "H87" },
  { value: "KG", label: "Kilogramo (granel)", sat: "KGM" },
  { value: "G", label: "Gramo", sat: "GRM" },
  { value: "L", label: "Litro", sat: "LTR" },
  { value: "ML", label: "Mililitro", sat: "MLT" },
  { value: "M", label: "Metro", sat: "MTR" },
];

const empty = {
  name: "",
  description: "",
  barcode: "",
  sku: "",
  categoryId: "",
  unit: "PIECE",
  price: "",
  wholesalePrice: "",
  wholesaleMinQty: "",
  cost: "",
  stock: "",
  minStock: "5",
  trackExpiry: false,
  taxRate: "0.16",
  iepsRate: "0",
  satProductKey: "01010101",
  satUnitKey: "H87",
};

type FormState = typeof empty;

function toForm(product: Product | null): FormState {
  if (!product) return empty;
  return {
    name: product.name,
    description: product.description ?? "",
    barcode: product.barcode ?? "",
    sku: product.sku ?? "",
    categoryId: product.categoryId ?? "",
    unit: product.unit,
    price: String(product.price),
    wholesalePrice: product.wholesalePrice != null ? String(product.wholesalePrice) : "",
    wholesaleMinQty: product.wholesaleMinQty != null ? String(product.wholesaleMinQty) : "",
    cost: String(product.cost ?? 0),
    stock: String(product.stock),
    minStock: String(product.minStock),
    trackExpiry: product.trackExpiry,
    taxRate: String(product.taxRate),
    iepsRate: String(product.iepsRate),
    satProductKey: product.satProductKey,
    satUnitKey: product.satUnitKey,
  };
}

interface ProductFormProps {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

/** Se monta solo mientras está abierto, así el formulario inicia con los datos del producto. */
export function ProductForm(props: ProductFormProps) {
  return props.open ? <ProductFormDialog key={props.product?.id ?? "new"} {...props} /> : null;
}

function ProductFormDialog({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: ProductFormProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => toForm(product));
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description || null,
      barcode: form.barcode || null,
      sku: form.sku || null,
      categoryId: form.categoryId || null,
      unit: form.unit,
      price: form.price,
      wholesalePrice: form.wholesalePrice === "" ? null : form.wholesalePrice,
      wholesaleMinQty: form.wholesaleMinQty === "" ? null : form.wholesaleMinQty,
      cost: form.cost || 0,
      minStock: form.minStock || 0,
      trackExpiry: form.trackExpiry,
      taxRate: form.taxRate,
      iepsRate: form.iepsRate,
      satProductKey: form.satProductKey,
      satUnitKey: form.satUnitKey,
      ...(product ? {} : { stock: form.stock || 0 }),
    };
    try {
      await api(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PUT" : "POST",
        body,
      });
      toast.success(product ? "Producto actualizado" : "Producto creado");
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  const price = Number(form.price);
  const cost = Number(form.cost);
  const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={product ? "Editar producto" : "Nuevo producto"}>
        <form onSubmit={save} className="space-y-4">
          <Input label="Nombre" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Código de barras" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
            </div>
            <Button type="button" variant="secondary" onClick={() => setScanning(true)} aria-label="Escanear código">
              <ScanBarcode className="w-5 h-5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Categoría" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Se vende por"
              value={form.unit}
              onChange={(e) => {
                const unit = UNITS.find((u) => u.value === e.target.value)!;
                setForm((f) => ({ ...f, unit: unit.value, satUnitKey: unit.sat }));
              }}
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Precio de venta" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} required />
            <Input
              label="Costo"
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              hint={margin !== null ? `Margen ${margin}%` : product ? "Se recalcula con cada compra (promedio)" : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!product && (
              <Input label="Existencia inicial" inputMode="decimal" value={form.stock} onChange={(e) => set("stock", e.target.value)} />
            )}
            <Input label="Stock mínimo (alerta)" inputMode="decimal" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} />
          </div>
          {product && (
            <p className="text-xs text-slate-500">Para cambiar la existencia usa &quot;Ajustar existencia&quot; y queda registrado el motivo.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Precio de mayoreo" inputMode="decimal" value={form.wholesalePrice} onChange={(e) => set("wholesalePrice", e.target.value)} placeholder="Opcional" />
            <Input label="Mayoreo desde (cantidad)" inputMode="decimal" value={form.wholesaleMinQty} onChange={(e) => set("wholesaleMinQty", e.target.value)} placeholder="Ej. 12" />
          </div>
          <Checkbox label="Controlar lotes y fecha de caducidad" checked={form.trackExpiry} onChange={(e) => set("trackExpiry", e.target.checked)} />

          <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-sm text-brand-700 dark:text-brand-300 underline">
            {advanced ? "Ocultar" : "Mostrar"} impuestos y datos para factura
          </button>
          {advanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label="IVA" value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)}>
                  <option value="0.16">16%</option>
                  <option value="0.08">8% (frontera)</option>
                  <option value="0">0% (alimentos, medicinas)</option>
                </Select>
                <Select label="IEPS" value={form.iepsRate} onChange={(e) => set("iepsRate", e.target.value)}>
                  <option value="0">No aplica</option>
                  <option value="0.08">8% (botanas, dulces)</option>
                  <option value="0.265">26.5% (cerveza)</option>
                  <option value="0.3">30% (vinos y licores)</option>
                  <option value="0.53">53% (licores más de 20°)</option>
                  <option value="1.6">160% (cigarros)</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Clave SAT producto" value={form.satProductKey} onChange={(e) => set("satProductKey", e.target.value)} />
                <Input label="Clave SAT unidad" value={form.satUnitKey} onChange={(e) => set("satUnitKey", e.target.value)} />
              </div>
              <Input label="SKU interno" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
              <Textarea label="Descripción" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
              <p className="text-xs text-slate-500">Los precios incluyen impuestos. El desglose se calcula al facturar.</p>
            </div>
          )}

          <Button type="submit" className="w-full" loading={saving}>
            Guardar
          </Button>
        </form>
      </Modal>
      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          set("barcode", code);
          setScanning(false);
        }}
      />
    </>
  );
}
