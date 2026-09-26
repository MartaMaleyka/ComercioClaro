"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import { Plus, ScanBarcode, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import type { Category, Product } from "@/lib/client/types";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { useSession } from "@/components/providers/SessionProvider";
import { countryConfig } from "@/lib/country";

const UNITS = [
  { value: "PIECE", label: "Pieza", sat: "H87" },
  { value: "KG", label: "Kilogramo (granel)", sat: "KGM" },
  { value: "G", label: "Gramo", sat: "GRM" },
  { value: "L", label: "Litro", sat: "LTR" },
  { value: "ML", label: "Mililitro", sat: "MLT" },
  { value: "M", label: "Metro", sat: "MTR" },
  { value: "LB", label: "Libra (granel)", sat: "LBR" },
  { value: "OZ", label: "Onza", sat: "ONZ" },
  { value: "GAL", label: "Galón", sat: "GLL" },
];
/** En Panamá la carne, el queso y los granos se venden por libra: van primero, después de pieza. */
const IMPERIAL = ["LB", "OZ", "GAL"];
const UNITS_PA = [
  UNITS[0],
  ...UNITS.filter((u) => IMPERIAL.includes(u.value)),
  ...UNITS.slice(1).filter((u) => !IMPERIAL.includes(u.value)),
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
  packSize: "",
  taxRate: "",
  iepsRate: "0",
  satProductKey: "01010101",
  satUnitKey: "H87",
  variantGroup: "",
  variantLabel: "",
  sendToKitchen: false,
  trackStock: true,
  seniorEligible: true,
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
    packSize: product.packSize != null ? String(product.packSize) : "",
    taxRate: String(product.taxRate),
    iepsRate: String(product.iepsRate),
    satProductKey: product.satProductKey,
    satUnitKey: product.satUnitKey,
    variantGroup: product.variantGroup ?? "",
    variantLabel: product.variantLabel ?? "",
    sendToKitchen: product.sendToKitchen ?? false,
    trackStock: product.trackStock ?? true,
    seniorEligible: product.seniorEligible ?? true,
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

function ProductFormDialog({ open, product, categories, onClose, onSaved }: ProductFormProps) {
  const tr = useText();
  const toast = useToast();
  const { business } = useSession();
  const canVariants = business.features.includes("variants");
  const country = countryConfig(business.country);
  const [form, setForm] = useState<FormState>(() => {
    const initial = toForm(product);
    return initial.taxRate === "" ? { ...initial, taxRate: String(country.defaultTaxRate) } : initial;
  });
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(
    Boolean(product?.variantGroup || (product?.modifiers?.length ?? 0) > 0)
  );
  const [modifiers, setModifiers] = useState(() =>
    (product?.modifiers ?? []).map((m) => ({ id: m.id, name: m.name, price: String(m.price) }))
  );
  const [newVariants, setNewVariants] = useState("");
  const [baseLabel, setBaseLabel] = useState(product?.variantLabel ?? "");
  const [creatingVariants, setCreatingVariants] = useState(false);

  async function createVariants() {
    if (!product) return;
    setCreatingVariants(true);
    try {
      const created = await api<unknown[]>(`/api/products/${product.id}/variants`, {
        body: { baseLabel: baseLabel || product.name, labels: newVariants.split(",") },
      });
      toast.success(
        tr("{n} variantes creadas. Ajusta su existencia y código en el inventario.", { n: created.length })
      );
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setCreatingVariants(false);
    }
  }

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
      packSize: form.packSize === "" ? null : form.packSize,
      taxRate: form.taxRate,
      iepsRate: form.iepsRate,
      satProductKey: form.satProductKey,
      satUnitKey: form.satUnitKey,
      variantGroup: form.variantGroup || null,
      variantLabel: form.variantLabel || null,
      sendToKitchen: form.sendToKitchen,
      trackStock: form.trackStock,
      seniorEligible: form.seniorEligible,
      modifiers: modifiers
        .filter((m) => m.name.trim())
        .map((m) => ({ id: m.id, name: m.name.trim(), price: Number(m.price.replace(",", ".")) || 0 })),
      ...(product ? {} : { stock: form.stock || 0 }),
    };
    try {
      await api(product ? `/api/products/${product.id}` : "/api/products", {
        method: product ? "PUT" : "POST",
        body,
      });
      toast.success(product ? tr("Producto actualizado") : tr("Producto creado"));
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
      <Modal open={open} onClose={onClose} title={product ? tr("Editar producto") : tr("Nuevo producto")}>
        <form onSubmit={save} className="space-y-4">
          <Input
            label={tr("Nombre")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoFocus
          />
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label={tr("Código de barras")}
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setScanning(true)}
              aria-label={tr("Escanear código")}
            >
              <ScanBarcode className="w-5 h-5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={tr("Categoría")} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">{tr("Sin categoría")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label={tr("Se vende por")}
              value={form.unit}
              onChange={(e) => {
                const unit = UNITS.find((u) => u.value === e.target.value)!;
                setForm((f) => ({ ...f, unit: unit.value, satUnitKey: unit.sat }));
              }}
            >
              {(country.code === "PA" ? UNITS_PA : UNITS).map((u) => (
                <option key={u.value} value={u.value}>
                  {tr(u.label)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={tr("Precio de venta")}
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              required
            />
            <Input
              label={tr("Costo")}
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => set("cost", e.target.value)}
              hint={
                margin !== null
                  ? tr("Margen {n}%", { n: margin })
                  : product
                    ? tr("Se recalcula con cada compra (promedio)")
                    : undefined
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!product && (
              <Input
                label={tr("Existencia inicial")}
                inputMode="decimal"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
              />
            )}
            <Input
              label={tr("Stock mínimo (alerta)")}
              inputMode="decimal"
              value={form.minStock}
              onChange={(e) => set("minStock", e.target.value)}
            />
          </div>
          {product && (
            <p className="text-xs text-slate-500">
              {tr('Para cambiar la existencia usa "Ajustar existencia" y queda registrado el motivo.')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={tr("Precio de mayoreo")}
              inputMode="decimal"
              value={form.wholesalePrice}
              onChange={(e) => set("wholesalePrice", e.target.value)}
              placeholder={tr("Opcional")}
            />
            <Input
              label={tr("Mayoreo desde (cantidad)")}
              inputMode="decimal"
              value={form.wholesaleMinQty}
              onChange={(e) => set("wholesaleMinQty", e.target.value)}
              placeholder={tr("Ej. 12")}
            />
          </div>
          <Input
            label={tr("Unidades por caja (opcional)")}
            inputMode="numeric"
            value={form.packSize}
            onChange={(e) => set("packSize", e.target.value)}
            hint={tr("Si compras por caja y vendes suelto (p. ej. 20 cigarrillos por cajetilla, 30 huevos por cartón)")}
          />
          {business.restaurantMode && (
            <Checkbox
              label={tr("Se prepara en cocina (aparece en la pantalla de cocina)")}
              checked={form.sendToKitchen}
              onChange={(e) => set("sendToKitchen", e.target.checked)}
            />
          )}
          <Checkbox
            label={tr("Es un servicio: no lleva existencias (entrega, reparación, recarga propia)")}
            checked={!form.trackStock}
            onChange={(e) => set("trackStock", !e.target.checked)}
          />
          {business.seniorDiscountRate > 0 && (
            <Checkbox
              label={tr("Aplica el descuento de jubilado")}
              checked={form.seniorEligible}
              onChange={(e) => set("seniorEligible", e.target.checked)}
            />
          )}
          <Checkbox
            label={tr("Controlar lotes y fecha de caducidad")}
            checked={form.trackExpiry}
            onChange={(e) => set("trackExpiry", e.target.checked)}
          />

          {canVariants && (
            <button
              type="button"
              aria-expanded={variantsOpen}
              onClick={() => setVariantsOpen((v) => !v)}
              className="block text-sm text-brand-700 dark:text-brand-300 underline"
            >
              {variantsOpen ? tr("Ocultar") : tr("Mostrar")} {tr("variantes y extras")}
            </button>
          )}
          {variantsOpen && canVariants && (
            <div className="space-y-3 rounded-xl border border-slate-100 p-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={tr("Grupo de variantes")}
                  value={form.variantGroup}
                  onChange={(e) => set("variantGroup", e.target.value)}
                  placeholder={tr("Ej. Camiseta básica")}
                  hint={tr("Los productos del mismo grupo se muestran juntos al vender")}
                />
                <Input
                  label={tr("Variante")}
                  value={form.variantLabel}
                  onChange={(e) => set("variantLabel", e.target.value)}
                  placeholder={tr("Ej. M / Azul")}
                />
              </div>
              {product && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">{tr("Crear variantes de este producto")}</p>
                  <div className="grid grid-cols-[120px_1fr_auto] gap-2 items-end">
                    <Input
                      label={tr("Este producto es")}
                      value={baseLabel}
                      onChange={(e) => setBaseLabel(e.target.value)}
                      placeholder={tr("Ej. M")}
                    />
                    <Input
                      label={tr("Nuevas variantes (separadas por coma)")}
                      value={newVariants}
                      onChange={(e) => setNewVariants(e.target.value)}
                      placeholder={tr("Ej. S, L, XL")}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      loading={creatingVariants}
                      disabled={!newVariants.trim()}
                      onClick={createVariants}
                    >
                      {tr("Crear")}
                    </Button>
                  </div>
                </div>
              )}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">{tr("Extras con precio")}</legend>
                {modifiers.map((m, i) => (
                  <div key={m.id} className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
                    <Input
                      label={tr("Extra")}
                      value={m.name}
                      onChange={(e) =>
                        setModifiers((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder={tr("Ej. Queso")}
                    />
                    <Input
                      label={tr("Precio")}
                      inputMode="decimal"
                      value={m.price}
                      onChange={(e) =>
                        setModifiers((list) => list.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                      }
                    />
                    <button
                      type="button"
                      aria-label={tr("Quitar {name}", { name: m.name || tr("Extra") })}
                      onClick={() => setModifiers((list) => list.filter((_, j) => j !== i))}
                      className="p-2.5 mb-0.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setModifiers((list) => [...list, { id: crypto.randomUUID().slice(0, 8), name: "", price: "" }])
                  }
                >
                  <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Agregar extra")}
                </Button>
              </fieldset>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="text-sm text-brand-700 dark:text-brand-300 underline"
          >
            {advanced ? tr("Ocultar") : tr("Mostrar")} {tr("impuestos y datos adicionales")}
          </button>
          {advanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Select label={country.taxLabel} value={form.taxRate} onChange={(e) => set("taxRate", e.target.value)}>
                  {[
                    ...new Map([
                      ...country.taxRates.map((r) => [String(r.value), r.label] as const),
                      [form.taxRate, `${Math.round(Number(form.taxRate) * 1000) / 10}%`] as const,
                    ]),
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                {country.hasIeps && (
                  <Select label={tr("IEPS")} value={form.iepsRate} onChange={(e) => set("iepsRate", e.target.value)}>
                    <option value="0">{tr("No aplica")}</option>
                    <option value="0.08">{tr("8% (botanas, dulces)")}</option>
                    <option value="0.265">{tr("26.5% (cerveza)")}</option>
                    <option value="0.3">{tr("30% (vinos y licores)")}</option>
                    <option value="0.53">{tr("53% (licores más de 20°)")}</option>
                    <option value="1.6">{tr("160% (cigarros)")}</option>
                  </Select>
                )}
              </div>
              {country.hasIeps && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={tr("Clave SAT producto")}
                    value={form.satProductKey}
                    onChange={(e) => set("satProductKey", e.target.value)}
                  />
                  <Input
                    label={tr("Clave SAT unidad")}
                    value={form.satUnitKey}
                    onChange={(e) => set("satUnitKey", e.target.value)}
                  />
                </div>
              )}
              <Input label={tr("SKU interno")} value={form.sku} onChange={(e) => set("sku", e.target.value)} />
              <Textarea
                label={tr("Descripción")}
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <p className="text-xs text-slate-500">
                {tr("Los precios incluyen impuestos. El desglose se calcula al facturar.")}
              </p>
            </div>
          )}

          <Button type="submit" className="w-full" loading={saving}>
            {tr("Guardar")}
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
