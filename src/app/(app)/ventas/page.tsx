"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  HandCoins,
  Landmark,
  Minus,
  Plus,
  Printer,
  ScanBarcode,
  Share2,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { api, fetcher, isNetworkError } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useDebounce } from "@/lib/client/hooks";
import { kvGet, kvSet, queueSale } from "@/lib/client/offline-db";
import { buildReceiptText, whatsappLink } from "@/lib/client/receipt";
import type { Customer, PaymentMethod, Product, Sale } from "@/lib/client/types";
import { cn, isFractionalUnit, UNIT_LABELS } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";

interface CartLine {
  productId: string;
  name: string;
  unit: Product["unit"];
  quantity: string;
  stock: number;
  price: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  /** Precio fijado a mano (solo dueño) */
  priceOverride: string;
  discount: string;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Efectivo", icon: Banknote },
  { value: "CARD", label: "Tarjeta", icon: CreditCard },
  { value: "TRANSFER", label: "Transferencia", icon: Landmark },
  { value: "CREDIT", label: "Fiado", icon: HandCoins },
];

const num = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function unitPrice(line: CartLine, isOwner: boolean) {
  if (isOwner && line.priceOverride !== "") return num(line.priceOverride);
  const q = num(line.quantity);
  if (line.wholesalePrice != null && line.wholesaleMinQty != null && q >= line.wholesaleMinQty) return line.wholesalePrice;
  return line.price;
}

function lineTotal(line: CartLine, isOwner: boolean) {
  const gross = round2(num(line.quantity) * unitPrice(line, isOwner));
  return Math.max(0, round2(gross - Math.min(num(line.discount), gross)));
}

/** Datos con respaldo local: si no hay red se usa la última copia guardada. */
function useCachedList<T>(url: string, cacheKey: string) {
  const [fallback, setFallback] = useState<T[] | undefined>(undefined);
  const swr = useSWR<{ items: T[] } | T[]>(url, fetcher, {
    onSuccess: (data) => {
      kvSet(cacheKey, data).catch(() => {});
    },
  });
  useEffect(() => {
    kvGet<{ items: T[] } | T[]>(cacheKey)
      .then((d) => d && setFallback(Array.isArray(d) ? d : d.items))
      .catch(() => {});
  }, [cacheKey]);
  const data = swr.data ? (Array.isArray(swr.data) ? swr.data : swr.data.items) : fallback;
  return { ...swr, list: data };
}

export default function PosPage() {
  const { business, role } = useSession();
  const isOwner = role === "OWNER";
  const fmt = useFormat();
  const toast = useToast();

  const catalog = useCachedList<Product>("/api/products?all=true", `catalog:${business.id}`);
  const customers = useCachedList<Customer>("/api/customers", `customers:${business.id}`);
  const { data: cash } = useSWR<{ current: { session: { id: string } } | null }>("/api/cash", fetcher);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 150);
  const [categoryId, setCategoryId] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [saleDiscount, setSaleDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [completed, setCompleted] = useState<{ sale: Sale | null; offline: boolean; total: number; change: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const products = useMemo(() => catalog.list ?? [], [catalog.list]);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => p.category && map.set(p.category.id, p.category.name));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return products
      .filter((p) => (!categoryId || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q) || p.barcode?.startsWith(q) || p.sku?.toLowerCase().startsWith(q)))
      .slice(0, 60);
  }, [products, debouncedSearch, categoryId]);

  const addProduct = useCallback(
    (product: Product, quantity?: number) => {
      const step = quantity ?? 1;
      setCart((current) => {
        const existing = current.find((c) => c.productId === product.id);
        const inCart = existing ? num(existing.quantity) : 0;
        if (inCart + step > product.stock) {
          toast.error(`Solo hay ${fmt.qty(product.stock, product.unit)} de ${product.name}`);
          return current;
        }
        if (existing) {
          return current.map((c) =>
            c.productId === product.id ? { ...c, quantity: String(round2(inCart + step)) } : c
          );
        }
        return [
          ...current,
          {
            productId: product.id,
            name: product.name,
            unit: product.unit,
            quantity: String(step),
            stock: product.stock,
            price: product.price,
            wholesalePrice: product.wholesalePrice,
            wholesaleMinQty: product.wholesaleMinQty,
            priceOverride: "",
            discount: "",
          },
        ];
      });
    },
    [fmt, toast]
  );

  const addByCode = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      const product = products.find((p) => p.barcode === trimmed || p.sku === trimmed);
      if (product) {
        addProduct(product);
        setSearch("");
        return true;
      }
      return false;
    },
    [products, addProduct]
  );

  function handleEnter() {
    if (addByCode(search)) return;
    if (filtered.length === 1) {
      addProduct(filtered[0]);
      setSearch("");
    }
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function stepLine(line: CartLine, delta: number) {
    const next = round2(num(line.quantity) + delta);
    if (next <= 0) return setCart((c) => c.filter((l) => l.productId !== line.productId));
    if (next > line.stock) return toast.error(`Solo hay ${fmt.qty(line.stock, line.unit)} de ${line.name}`);
    updateLine(line.productId, { quantity: String(next) });
  }

  const subtotal = round2(cart.reduce((acc, l) => acc + lineTotal(l, isOwner), 0));
  const discount = Math.min(num(saleDiscount), subtotal);
  const total = round2(subtotal - discount);
  const received = num(amountReceived);
  const change = paymentMethod === "CASH" && amountReceived ? round2(received - total) : 0;
  const customer = customers.list?.find((c) => c.id === customerId);
  const itemsCount = cart.reduce((acc, l) => acc + (isFractionalUnit(l.unit) ? 1 : num(l.quantity)), 0);

  const invalidLine = cart.find((l) => {
    const q = num(l.quantity);
    return q <= 0 || q > l.stock || (!isFractionalUnit(l.unit) && !Number.isInteger(q));
  });
  const creditExceeded =
    paymentMethod === "CREDIT" && customer && customer.creditLimit > 0 && customer.balance + total > customer.creditLimit;
  const canCharge =
    cart.length > 0 &&
    !invalidLine &&
    !(paymentMethod === "CREDIT" && !customerId) &&
    !creditExceeded &&
    !(paymentMethod === "CASH" && amountReceived !== "" && received < total);

  function resetSale() {
    setCart([]);
    setSaleDiscount("");
    setAmountReceived("");
    setCustomerId("");
    setNotes("");
    setPaymentMethod("CASH");
    setCheckoutOpen(false);
    searchRef.current?.focus();
  }

  async function charge() {
    if (!canCharge) return;
    setSaving(true);
    const payload = {
      clientRequestId: crypto.randomUUID(),
      items: cart.map((l) => ({
        productId: l.productId,
        quantity: num(l.quantity),
        discount: num(l.discount),
        ...(isOwner && l.priceOverride !== "" ? { unitPrice: num(l.priceOverride) } : {}),
      })),
      discount,
      paymentMethod,
      amountReceived: paymentMethod === "CASH" && amountReceived ? received : null,
      customerId: customerId || null,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };
    try {
      const sale = await api<Sale>("/api/sales", { body: payload });
      setCompleted({ sale, offline: false, total: sale.total, change: sale.change ?? 0 });
      catalog.mutate();
      if (paymentMethod === "CREDIT") customers.mutate();
      resetSale();
    } catch (err) {
      if (isNetworkError(err)) {
        try {
          await queueSale({ clientRequestId: payload.clientRequestId, businessId: business.id, payload, total, createdAt: payload.createdAt });
          // Descuenta las existencias en la copia local para no vender lo que ya no hay.
          const updated = products.map((p) => {
            const line = cart.find((l) => l.productId === p.id);
            return line ? { ...p, stock: round2(p.stock - num(line.quantity)) } : p;
          });
          await kvSet(`catalog:${business.id}`, { items: updated });
          catalog.mutate({ items: updated, nextCursor: null } as never, { revalidate: false });
          setCompleted({ sale: null, offline: true, total, change: Math.max(0, change) });
          resetSale();
        } catch {
          toast.error("Sin conexión y no se pudo guardar la venta en este dispositivo");
        }
      } else {
        toast.error(err);
      }
    } finally {
      setSaving(false);
    }
  }

  // Atajo: F2 enfoca el buscador; F9 cobra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9") {
        e.preventDefault();
        setCheckoutOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cartPanel = (
    <div className="space-y-4">
      {cart.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-500">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300" aria-hidden="true" />
          Agrega productos tocándolos o escaneando su código.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cart.map((line) => {
            const fractional = isFractionalUnit(line.unit);
            const price = unitPrice(line, isOwner);
            const wholesale = line.wholesalePrice != null && price === line.wholesalePrice && line.priceOverride === "";
            return (
              <li key={line.productId} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{line.name}</p>
                    <p className="text-xs text-slate-500">
                      {fmt.money(price)} / {UNIT_LABELS[line.unit]}
                      {wholesale && <Badge tone="blue" className="ml-1">Mayoreo</Badge>}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{fmt.money(lineTotal(line, isOwner))}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Quitar uno de ${line.name}`}
                      onClick={() => stepLine(line, fractional ? -0.25 : -1)}
                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"
                    >
                      {num(line.quantity) <= (fractional ? 0.25 : 1) ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </button>
                    <input
                      aria-label={`Cantidad de ${line.name}`}
                      inputMode={fractional ? "decimal" : "numeric"}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.productId, { quantity: e.target.value })}
                      className="w-16 text-center py-1.5 bg-surface border border-slate-200 rounded-lg text-sm"
                    />
                    <button
                      aria-label={`Agregar uno de ${line.name}`}
                      onClick={() => stepLine(line, fractional ? 0.25 : 1)}
                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-500 ml-1">{UNIT_LABELS[line.unit]}</span>
                  </div>
                  <input
                    aria-label={`Descuento de ${line.name}`}
                    inputMode="decimal"
                    placeholder="Desc. $"
                    value={line.discount}
                    onChange={(e) => updateLine(line.productId, { discount: e.target.value })}
                    className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm"
                  />
                  {isOwner && (
                    <input
                      aria-label={`Precio especial de ${line.name}`}
                      inputMode="decimal"
                      placeholder="Precio"
                      value={line.priceOverride}
                      onChange={(e) => updateLine(line.productId, { priceOverride: e.target.value })}
                      className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm"
                    />
                  )}
                </div>
                {invalidLine?.productId === line.productId && (
                  <p className="text-xs text-red-600">
                    Cantidad inválida (disponible: {fmt.qty(line.stock, line.unit)}
                    {!fractional && ", solo enteros"})
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 border-t border-slate-100 pt-3">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Forma de pago">
          {PAYMENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={paymentMethod === o.value}
              onClick={() => setPaymentMethod(o.value)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-medium border",
                paymentMethod === o.value
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-surface text-slate-600 border-slate-200"
              )}
            >
              <o.icon className="w-4 h-4" aria-hidden="true" />
              {o.label}
            </button>
          ))}
        </div>

        {(paymentMethod === "CREDIT" || customerId) && (
          <Select
            label={paymentMethod === "CREDIT" ? "Cliente (obligatorio para fiado)" : "Cliente"}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Selecciona un cliente</option>
            {customers.list?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.balance > 0 ? ` · debe ${fmt.money(c.balance)}` : ""}
              </option>
            ))}
          </Select>
        )}
        {paymentMethod !== "CREDIT" && !customerId && (
          <button onClick={() => setCustomerId(customers.list?.[0]?.id ?? "")} className="text-xs text-brand-700 dark:text-brand-300 hover:underline">
            Asignar cliente a la venta
          </button>
        )}
        {creditExceeded && customer && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            Excede el límite de crédito ({fmt.money(customer.balance)} de {fmt.money(customer.creditLimit)})
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input label="Descuento general" inputMode="decimal" placeholder="0.00" value={saleDiscount} onChange={(e) => setSaleDiscount(e.target.value)} />
          {paymentMethod === "CASH" && (
            <Input label="Paga con" inputMode="decimal" placeholder={total.toFixed(2)} value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
          )}
        </div>
        {paymentMethod === "CASH" && total > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {[...new Set([total, ...[50, 100, 200, 500, 1000].filter((b) => b > total)].slice(0, 4))].map((b) => (
              <button key={b} onClick={() => setAmountReceived(String(b))} className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium">
                {b === total ? "Exacto" : fmt.money(b)}
              </button>
            ))}
          </div>
        )}
        <Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{fmt.money(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-slate-600">
              <dt>Descuento</dt>
              <dd className="tabular-nums">-{fmt.money(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-slate-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{fmt.money(total)}</dd>
          </div>
          {paymentMethod === "CASH" && amountReceived !== "" && (
            <div className={cn("flex justify-between font-semibold", change < 0 ? "text-red-600" : "text-brand-600")}>
              <dt>{change < 0 ? "Falta" : "Cambio"}</dt>
              <dd className="tabular-nums">{fmt.money(Math.abs(change))}</dd>
            </div>
          )}
        </dl>

        <Button className="w-full" size="lg" onClick={charge} loading={saving} disabled={!canCharge}>
          Cobrar {fmt.money(total)}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {!cash?.current && cash !== undefined && (
        <div className="rounded-xl bg-amber-50 text-amber-800 px-4 py-2 text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Wallet className="w-4 h-4" aria-hidden="true" /> No hay caja abierta: las ventas no entrarán a un corte.
          </span>
          <Link href="/caja" className="font-medium underline whitespace-nowrap">
            Abrir caja
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="space-y-3 min-w-0">
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchBar
                ref={searchRef}
                value={search}
                onChange={setSearch}
                onEnter={handleEnter}
                placeholder="Buscar o escanear código (F2)"
                autoFocus
              />
            </div>
            <Button variant="secondary" onClick={() => setScannerOpen(true)} aria-label="Escanear con la cámara">
              <ScanBarcode className="w-5 h-5" />
            </Button>
          </div>

          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: "", name: "Todos" }, ...categories].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",
                    categoryId === c.id ? "bg-brand-600 text-white border-brand-600" : "bg-surface text-slate-600 border-slate-200"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {catalog.list === undefined ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              {products.length === 0 ? (
                <>
                  Aún no hay productos.{" "}
                  {isOwner && (
                    <Link href="/inventario" className="underline">
                      Agrega tu inventario
                    </Link>
                  )}
                </>
              ) : (
                "Sin resultados"
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.map((p) => {
                const inCart = cart.find((c) => c.productId === p.id);
                const out = p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    disabled={out}
                    className={cn(
                      "text-left p-3 rounded-xl border bg-surface transition-colors disabled:opacity-50",
                      inCart ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
                    <p className="text-sm font-medium text-slate-900 line-clamp-2">{p.name}</p>
                    <p className="text-sm font-semibold text-brand-700 dark:text-brand-300 mt-1">
                      {fmt.money(p.price)}
                      {p.unit !== "PIECE" && <span className="text-xs font-normal text-slate-500">/{UNIT_LABELS[p.unit]}</span>}
                    </p>
                    <p className={cn("text-xs", out ? "text-red-600" : p.stock <= p.minStock ? "text-amber-600" : "text-slate-500")}>
                      {out ? "Agotado" : `${fmt.qty(p.stock, p.unit)} disp.`}
                      {inCart && ` · ${inCart.quantity} en carrito`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Card className="hidden lg:block p-4 sticky top-4">
          <h2 className="font-semibold text-slate-900 mb-2">Venta actual</h2>
          {cartPanel}
        </Card>
      </div>

      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 px-4 pb-2 z-30">
          <Button className="w-full shadow-lg" size="lg" onClick={() => setCheckoutOpen(true)}>
            <ShoppingCart className="w-5 h-5" /> Ver carrito ({itemsCount}) · {fmt.money(total)}
          </Button>
        </div>
      )}

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Venta actual">
        {cartPanel}
      </Modal>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          setScannerOpen(false);
          if (!addByCode(code)) {
            setSearch(code);
            toast.error(`No hay producto con el código ${code}`);
          }
        }}
      />

      <Modal open={completed !== null} onClose={() => setCompleted(null)} title={completed?.offline ? "Venta guardada sin conexión" : "¡Venta registrada!"}>
        {completed && (
          <div className="space-y-4 text-center">
            {completed.sale && <p className="text-sm text-slate-500">Ticket #{completed.sale.folio}</p>}
            <p className="text-3xl font-bold text-slate-900">{fmt.money(completed.total)}</p>
            {completed.change > 0 && (
              <p className="text-lg font-semibold text-brand-600">Cambio: {fmt.money(completed.change)}</p>
            )}
            {completed.offline && (
              <p className="text-sm text-slate-500">Se enviará automáticamente cuando vuelva la conexión.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {completed.sale && (
                <>
                  <Button variant="secondary" onClick={() => window.open(`/ventas/${completed.sale!.id}/ticket`, "_blank")}>
                    <Printer className="w-4 h-4" /> Imprimir
                  </Button>
                  <a
                    className="inline-flex items-center justify-center gap-2 font-medium px-4 py-2.5 text-sm rounded-xl bg-surface text-slate-700 border border-slate-200 hover:bg-slate-50"
                    href={whatsappLink(buildReceiptText(completed.sale, business), completed.sale.customer?.phone, business.locale)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Share2 className="w-4 h-4" /> WhatsApp
                  </a>
                </>
              )}
            </div>
            <Button className="w-full" onClick={() => setCompleted(null)}>
              Nueva venta
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
