"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  MonitorSmartphone,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { api, fetcher, isNetworkError } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useT, useText } from "@/lib/client/i18n";
import { useDebounce } from "@/lib/client/hooks";
import { kvGet, kvSet, queueSale } from "@/lib/client/offline-db";
import { buildReceiptText, whatsappLink } from "@/lib/client/receipt";
import { useDisplayRemote, usePublishDisplay } from "@/lib/client/display";
import type { Customer, PaymentMethod, Product, Sale } from "@/lib/client/types";
import { cn, isFractionalUnit, UNIT_LABELS } from "@/lib/utils";
import { countryConfig } from "@/lib/country";
import { bestPromotion, type PromotionRule } from "@/lib/promotions";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";
import { YappyApiCharge } from "@/components/pos/YappyApiCharge";
import { ServicesModal } from "@/components/pos/ServicesModal";

interface OnlineOrderData {
  id: string;
  number: number;
  customerName: string;
  items: { productId: string; name: string; quantity: number }[];
}

interface CartLine {
  productId: string;
  categoryId: string | null;
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
  { value: "YAPPY", label: "Yappy", icon: Smartphone },
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
  if (line.wholesalePrice != null && line.wholesaleMinQty != null && q >= line.wholesaleMinQty)
    return line.wholesalePrice;
  return line.price;
}

/** Promoción que el servidor aplicará al renglón (misma regla que en el servidor). */
function linePromotion(line: CartLine, isOwner: boolean, promotions: PromotionRule[]) {
  return bestPromotion(promotions, {
    productId: line.productId,
    categoryId: line.categoryId,
    quantity: num(line.quantity),
    unitPrice: unitPrice(line, isOwner),
  });
}

function lineTotal(line: CartLine, isOwner: boolean, promotions: PromotionRule[] = []) {
  const gross = round2(num(line.quantity) * unitPrice(line, isOwner));
  const promo = linePromotion(line, isOwner, promotions)?.discount ?? 0;
  return Math.max(0, round2(gross - Math.min(num(line.discount) + promo, gross)));
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
  const tr = useText();
  const { business, role } = useSession();
  const isOwner = role === "OWNER";
  const fmt = useFormat();
  const t = useT();
  const toast = useToast();

  const catalog = useCachedList<Product>("/api/products?all=true", `catalog:${business.id}`);
  const customers = useCachedList<Customer>("/api/customers", `customers:${business.id}`);
  const country = countryConfig(business.country);
  const paymentOptions = PAYMENT_OPTIONS.filter((o) => country.paymentMethods.includes(o.value));
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
  const [paymentReference, setPaymentReference] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const { data: promotionList } = useSWR<PromotionRule[]>("/api/promotions", fetcher);
  // Con la API de Yappy la venta se registra sola al confirmarse el pago.
  const [yappyManual, setYappyManual] = useState(false);
  const yappyApi = business.yappyMode === "API" && !yappyManual;
  const { data: yappy } = useSWR<{ directory: string | null; qr: string | null }>(
    paymentMethod === "YAPPY" ? "/api/business/yappy" : null,
    fetcher
  );
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [completed, setCompleted] = useState<{
    sale: Sale | null;
    offline: boolean;
    total: number;
    change: number;
  } | null>(null);
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
      .filter(
        (p) =>
          (!categoryId || p.categoryId === categoryId) &&
          (!q || p.name.toLowerCase().includes(q) || p.barcode?.startsWith(q) || p.sku?.toLowerCase().startsWith(q))
      )
      .slice(0, 60);
  }, [products, debouncedSearch, categoryId]);

  // Pedido del catálogo en línea que se cobra en esta venta (llega como /ventas?pedido=ID).
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderParam = searchParams.get("pedido");
  const [onlineOrder, setOnlineOrder] = useState<{ id: string; number: number; customerName: string } | null>(null);
  useEffect(() => {
    if (!orderParam || products.length === 0) return;
    let cancelled = false;
    api<OnlineOrderData>(`/api/orders/${orderParam}`)
      .then((order) => {
        if (cancelled) return;
        const missing: string[] = [];
        const lines: CartLine[] = [];
        for (const item of order.items) {
          const product = products.find((p) => p.id === item.productId);
          const quantity = product ? Math.min(item.quantity, product.stock) : 0;
          if (!product || quantity <= 0) {
            missing.push(item.name);
            continue;
          }
          lines.push({
            productId: product.id,
            categoryId: product.categoryId,
            name: product.name,
            unit: product.unit,
            quantity: String(quantity),
            stock: product.stock,
            price: product.price,
            wholesalePrice: product.wholesalePrice,
            wholesaleMinQty: product.wholesaleMinQty,
            priceOverride: "",
            discount: "",
          });
        }
        setCart(lines);
        setOnlineOrder({ id: order.id, number: order.number, customerName: order.customerName });
        setNotes(tr("Pedido en línea #{n} · {name}", { n: order.number, name: order.customerName }));
        if (missing.length > 0) toast.error(tr("Sin existencias: {items}", { items: missing.join(", ") }));
        router.replace("/ventas");
      })
      .catch((err) => toast.error(err));
    return () => {
      cancelled = true;
    };
  }, [orderParam, products, router, toast, tr]);

  const addProduct = (product: Product, quantity?: number) => {
    const step = quantity ?? 1;
    setCart((current) => {
      const existing = current.find((c) => c.productId === product.id);
      const inCart = existing ? num(existing.quantity) : 0;
      if (inCart + step > product.stock) {
        toast.error(t("pos.onlyStock", { qty: fmt.qty(product.stock, product.unit), name: product.name }));
        return current;
      }
      if (existing) {
        return current.map((c) => (c.productId === product.id ? { ...c, quantity: String(round2(inCart + step)) } : c));
      }
      return [
        ...current,
        {
          productId: product.id,
          categoryId: product.categoryId,
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
  };

  const addByCode = (code: string) => {
    const trimmed = code.trim();
    const product = products.find((p) => p.barcode === trimmed || p.sku === trimmed);
    if (product) {
      addProduct(product);
      setSearch("");
      return true;
    }
    return false;
  };

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
    if (next > line.stock)
      return toast.error(t("pos.onlyStock", { qty: fmt.qty(line.stock, line.unit), name: line.name }));
    updateLine(line.productId, { quantity: String(next) });
  }

  const promotions = useMemo(() => promotionList ?? [], [promotionList]);
  const subtotal = round2(cart.reduce((acc, l) => acc + lineTotal(l, isOwner, promotions), 0));
  const discount = Math.min(num(saleDiscount), subtotal);
  const customerForPoints = customers.list?.find((c) => c.id === customerId);
  const pointValue = business.loyaltyPointValue;
  const maxRedeem =
    business.loyaltyEnabled && customerForPoints && pointValue > 0
      ? Math.min(customerForPoints.points ?? 0, Math.floor((subtotal - discount) / pointValue + 1e-9))
      : 0;
  const pointsToRedeem = Math.min(Math.max(0, Math.floor(num(redeemPoints))), maxRedeem);
  const pointsDiscount = round2(pointsToRedeem * pointValue);
  const total = round2(subtotal - discount - pointsDiscount);
  const received = num(amountReceived);
  const change = paymentMethod === "CASH" && amountReceived ? round2(received - total) : 0;
  const customer = customers.list?.find((c) => c.id === customerId);
  const itemsCount = cart.reduce((acc, l) => acc + (isFractionalUnit(l.unit) ? 1 : num(l.quantity)), 0);

  // Pantalla para el cliente: lo que se cobra, el ahorro y el QR de Yappy.
  const grossTotal = round2(cart.reduce((acc, l) => acc + num(l.quantity) * unitPrice(l, isOwner), 0));
  usePublishDisplay(
    completed
      ? {
          status: "done",
          lines: [],
          subtotal: completed.total,
          discount: 0,
          total: completed.total,
          paymentMethod: "CASH",
          customerName: null,
          points: null,
          change: completed.change,
        }
      : {
          status: cart.length > 0 ? "cart" : "idle",
          lines: cart.map((l) => ({
            name: l.name,
            quantity: num(l.quantity),
            unit: l.unit,
            total: lineTotal(l, isOwner, promotions),
            promotion: linePromotion(l, isOwner, promotions)?.promotion.name ?? null,
          })),
          subtotal,
          discount: Math.max(0, round2(grossTotal - total)),
          total,
          paymentMethod,
          customerName: customer?.name ?? null,
          points: business.loyaltyEnabled && customer ? (customer.points ?? 0) : null,
          change: 0,
        }
  );
  const [displayOpen, setDisplayOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [displayRemote, setDisplayRemote] = useDisplayRemote();

  const invalidLine = cart.find((l) => {
    const q = num(l.quantity);
    return q <= 0 || q > l.stock || (!isFractionalUnit(l.unit) && !Number.isInteger(q));
  });
  const creditExceeded =
    paymentMethod === "CREDIT" &&
    customer &&
    customer.creditLimit > 0 &&
    customer.balance + total > customer.creditLimit;
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
    setPaymentReference("");
    setRedeemPoints("");
    setYappyManual(false);
    setOnlineOrder(null);
    setPaymentMethod("CASH");
    setCheckoutOpen(false);
    searchRef.current?.focus();
  }

  async function charge(yappyChargeId?: string) {
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
      paymentReference: paymentMethod !== "CASH" && paymentMethod !== "CREDIT" ? paymentReference || null : null,
      yappyChargeId: yappyChargeId ?? null,
      onlineOrderId: onlineOrder?.id ?? null,
      redeemPoints: pointsToRedeem > 0 ? pointsToRedeem : null,
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
          await queueSale({
            clientRequestId: payload.clientRequestId,
            businessId: business.id,
            payload,
            total,
            createdAt: payload.createdAt,
          });
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
          toast.error(tr("Sin conexión y no se pudo guardar la venta en este dispositivo"));
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
          {t("pos.empty")}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cart.map((line) => {
            const fractional = isFractionalUnit(line.unit);
            const price = unitPrice(line, isOwner);
            const wholesale = line.wholesalePrice != null && price === line.wholesalePrice && line.priceOverride === "";
            const promo = linePromotion(line, isOwner, promotions);
            return (
              <li key={line.productId} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{line.name}</p>
                    <p className="text-xs text-slate-500">
                      {fmt.money(price)} / {UNIT_LABELS[line.unit]}
                      {wholesale && (
                        <Badge tone="blue" className="ml-1">
                          {t("pos.wholesale")}
                        </Badge>
                      )}
                      {promo && (
                        <Badge tone="purple" className="ml-1">
                          {promo.promotion.name} −{fmt.money(promo.discount)}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {fmt.money(lineTotal(line, isOwner, promotions))}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Quitar uno de ${line.name}`}
                      onClick={() => stepLine(line, fractional ? -0.25 : -1)}
                      className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"
                    >
                      {num(line.quantity) <= (fractional ? 0.25 : 1) ? (
                        <Trash2 className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
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
                    placeholder={t("pos.lineDiscount")}
                    value={line.discount}
                    onChange={(e) => updateLine(line.productId, { discount: e.target.value })}
                    className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm"
                  />
                  {isOwner && (
                    <input
                      aria-label={`Precio especial de ${line.name}`}
                      inputMode="decimal"
                      placeholder={t("pos.price")}
                      value={line.priceOverride}
                      onChange={(e) => updateLine(line.productId, { priceOverride: e.target.value })}
                      className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm"
                    />
                  )}
                </div>
                {invalidLine?.productId === line.productId && (
                  <p className="text-xs text-red-600">
                    {t("pos.invalidQty")} ({t("pos.available")}: {fmt.qty(line.stock, line.unit)}
                    {!fractional && `, ${t("pos.onlyIntegers")}`})
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 border-t border-slate-100 pt-3">
        <div
          className={cn("grid gap-1.5", paymentOptions.length > 4 ? "grid-cols-5" : "grid-cols-4")}
          role="radiogroup"
          aria-label={t("pos.paymentMethod")}
        >
          {paymentOptions.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={paymentMethod === o.value}
              onClick={() => setPaymentMethod(o.value)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-0.5 rounded-xl font-medium border min-w-0",
                paymentOptions.length > 4 ? "text-[11px]" : "text-xs",
                paymentMethod === o.value
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-surface text-slate-600 border-slate-200"
              )}
            >
              <o.icon className="w-4 h-4" aria-hidden="true" />
              <span className="truncate max-w-full">{t(`pay.${o.value}`)}</span>
            </button>
          ))}
        </div>

        {paymentMethod === "YAPPY" && yappyApi && (
          <YappyApiCharge
            amount={total}
            disabled={!canCharge || saving}
            onPaid={(chargeId) => charge(chargeId)}
            onManual={() => setYappyManual(true)}
          />
        )}
        {paymentMethod === "YAPPY" && !yappyApi && (
          <div className="rounded-xl bg-slate-50 p-3 flex gap-3 items-center">
            {yappy?.qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={yappy.qr}
                alt={tr("QR de Yappy del comercio")}
                className="w-24 h-24 rounded-lg bg-white object-contain"
              />
            )}
            <div className="text-sm space-y-1">
              <p className="font-medium text-slate-900">{t("pos.yappyCharge", { amount: fmt.money(total) })}</p>
              {yappy?.directory ? (
                <p className="text-slate-600">
                  {t("pos.yappyDirectory")}: {yappy.directory}
                </p>
              ) : (
                !yappy?.qr && <p className="text-xs text-slate-500">{t("pos.yappySetup")}</p>
              )}
              <p className="text-xs text-slate-500">{t("pos.yappyConfirm")}</p>
            </div>
          </div>
        )}
        {((paymentMethod === "YAPPY" && !yappyApi) || paymentMethod === "CARD" || paymentMethod === "TRANSFER") && (
          <Input
            label={paymentMethod === "YAPPY" ? t("pos.yappyRef") : t("pos.reference")}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
          />
        )}

        {(paymentMethod === "CREDIT" || customerId) && (
          <Select
            label={paymentMethod === "CREDIT" ? t("pos.customerRequired") : t("pos.customer")}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">{t("pos.selectCustomer")}</option>
            {customers.list?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.balance > 0 ? ` · ${t("pos.owes")} ${fmt.money(c.balance)}` : ""}
              </option>
            ))}
          </Select>
        )}
        {paymentMethod !== "CREDIT" && !customerId && (
          <button
            onClick={() => setCustomerId(customers.list?.[0]?.id ?? "")}
            className="text-xs text-brand-700 dark:text-brand-300 hover:underline"
          >
            {t("pos.assignCustomer")}
          </button>
        )}
        {creditExceeded && customer && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {t("pos.creditExceeded")} ({fmt.money(customer.balance)} / {fmt.money(customer.creditLimit)})
          </p>
        )}

        {business.loyaltyEnabled && customerForPoints && (customerForPoints.points ?? 0) > 0 && (
          <Input
            label={t("pos.redeemPoints")}
            inputMode="numeric"
            placeholder="0"
            value={redeemPoints}
            onChange={(e) => setRedeemPoints(e.target.value)}
            hint={t("pos.pointsAvailable", {
              points: customerForPoints.points ?? 0,
              value: fmt.money((customerForPoints.points ?? 0) * pointValue),
            })}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input
            label={t("pos.saleDiscount")}
            inputMode="decimal"
            placeholder="0.00"
            value={saleDiscount}
            onChange={(e) => setSaleDiscount(e.target.value)}
          />
          {paymentMethod === "CASH" && (
            <Input
              label={t("pos.paysWith")}
              inputMode="decimal"
              placeholder={total.toFixed(2)}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
            />
          )}
        </div>
        {paymentMethod === "CASH" && total > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {[...new Set([total, ...[50, 100, 200, 500, 1000].filter((b) => b > total)].slice(0, 4))].map((b) => (
              <button
                key={b}
                onClick={() => setAmountReceived(String(b))}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium"
              >
                {b === total ? t("pos.exact") : fmt.money(b)}
              </button>
            ))}
          </div>
        )}
        <Input
          label={t("pos.notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("pos.optional")}
        />

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <dt>{t("pos.subtotal")}</dt>
            <dd className="tabular-nums">{fmt.money(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-slate-600">
              <dt>{t("pos.discount")}</dt>
              <dd className="tabular-nums">-{fmt.money(discount)}</dd>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-slate-600">
              <dt>{t("pos.points")}</dt>
              <dd className="tabular-nums">-{fmt.money(pointsDiscount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-slate-900">
            <dt>{t("pos.total")}</dt>
            <dd className="tabular-nums">{fmt.money(total)}</dd>
          </div>
          {paymentMethod === "CASH" && amountReceived !== "" && (
            <div className={cn("flex justify-between font-semibold", change < 0 ? "text-red-600" : "text-brand-600")}>
              <dt>{change < 0 ? t("pos.missing") : t("pos.change")}</dt>
              <dd className="tabular-nums">{fmt.money(Math.abs(change))}</dd>
            </div>
          )}
        </dl>

        <Button
          className={cn("w-full", paymentMethod === "YAPPY" && yappyApi && "hidden")}
          size="lg"
          onClick={() => charge()}
          loading={saving}
          disabled={!canCharge}
        >
          {t("pos.charge")} {fmt.money(total)}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <h1 className="sr-only">{t("nav.sell")}</h1>
      {/* Anuncia el total al agregar o quitar productos, para quien usa lector de pantalla. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {cart.length > 0 ? `${t("pos.total")}: ${fmt.money(total)}` : ""}
      </p>
      {onlineOrder && (
        <div
          role="status"
          className="rounded-xl bg-blue-50 text-blue-700 px-4 py-2 text-sm flex items-center justify-between gap-2"
        >
          <span>
            {tr("Cobrando el pedido en línea #{n} de {name}", {
              n: onlineOrder.number,
              name: onlineOrder.customerName,
            })}
          </span>
          <button type="button" className="font-medium underline" onClick={() => setOnlineOrder(null)}>
            {tr("Desvincular")}
          </button>
        </div>
      )}
      {!cash?.current && cash !== undefined && (
        <div className="rounded-xl bg-amber-50 text-amber-800 px-4 py-2 text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Wallet className="w-4 h-4" aria-hidden="true" /> {t("pos.noCash")}
          </span>
          <Link href="/caja" className="font-medium underline whitespace-nowrap">
            {t("pos.openCash")}
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
                placeholder={t("pos.search")}
                autoFocus
              />
            </div>
            <Button variant="secondary" onClick={() => setScannerOpen(true)} aria-label={t("pos.scan")}>
              <ScanBarcode className="w-5 h-5" />
            </Button>
            <Button variant="secondary" onClick={() => setServicesOpen(true)} aria-label={tr("Recargas y servicios")}>
              <Zap className="w-5 h-5" />
            </Button>
            <Button variant="secondary" onClick={() => setDisplayOpen(true)} aria-label={tr("Pantalla del cliente")}>
              <MonitorSmartphone className="w-5 h-5" />
            </Button>
          </div>

          {categories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: "", name: t("pos.all") }, ...categories].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",
                    categoryId === c.id
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-surface text-slate-600 border-slate-200"
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
                  {t("pos.noProducts")}{" "}
                  {isOwner && (
                    <Link href="/inventario" className="underline">
                      {t("pos.addInventory")}
                    </Link>
                  )}
                </>
              ) : (
                t("pos.noResults")
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
                      "relative text-left p-3 rounded-xl border bg-surface transition-[color,border-color,transform] motion-safe:active:scale-[0.98] disabled:opacity-50",
                      inCart ? "border-brand-600 ring-1 ring-brand-600" : "border-slate-100 hover:border-slate-300"
                    )}
                  >
                    {inCart && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-2 -right-2 min-w-6 h-6 px-1.5 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shadow tabular-nums"
                      >
                        {fmt.number(Number(inCart.quantity))}
                      </span>
                    )}
                    <p className="text-sm font-medium text-slate-900 line-clamp-2 pr-3">{p.name}</p>
                    <p className="text-sm font-semibold text-brand-700 dark:text-brand-300 mt-1">
                      {fmt.money(p.price)}
                      {p.unit !== "PIECE" && (
                        <span className="text-xs font-normal text-slate-500">/{UNIT_LABELS[p.unit]}</span>
                      )}
                    </p>
                    <p
                      className={cn(
                        "text-xs",
                        out ? "text-red-600" : p.stock <= p.minStock ? "text-amber-600" : "text-slate-500"
                      )}
                    >
                      {out ? t("pos.soldOut") : `${fmt.qty(p.stock, p.unit)} ${t("pos.available")}`}
                      {inCart && <span className="sr-only">{` · ${inCart.quantity} ${t("pos.inCart")}`}</span>}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Card className="hidden lg:block p-4 sticky top-4">
          <h2 className="font-semibold text-slate-900 mb-2">{t("pos.currentSale")}</h2>
          {cartPanel}
        </Card>
      </div>

      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 px-4 pb-2 z-30">
          <Button className="w-full shadow-lg" size="lg" onClick={() => setCheckoutOpen(true)}>
            <ShoppingCart className="w-5 h-5" /> {t("pos.viewCart")} ({itemsCount}) · {fmt.money(total)}
          </Button>
        </div>
      )}

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title={t("pos.currentSale")}>
        {cartPanel}
      </Modal>

      {servicesOpen && <ServicesModal open onClose={() => setServicesOpen(false)} />}

      <Modal open={displayOpen} onClose={() => setDisplayOpen(false)} title={tr("Pantalla del cliente")}>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            {tr(
              "Muestra al cliente lo que se cobra, el total y el QR de Yappy. Úsala en un segundo monitor o en una tableta."
            )}
          </p>
          <Button
            className="w-full"
            onClick={() => {
              window.open("/pantalla-cliente", "comercioclaro-pantalla", "popup,width=1024,height=768");
              setDisplayOpen(false);
            }}
          >
            <MonitorSmartphone className="w-4 h-4" /> {tr("Abrir en este equipo")}
          </Button>
          <Checkbox
            label={tr("Enviar también a otra pantalla o tableta")}
            checked={displayRemote}
            onChange={(e) => setDisplayRemote(e.target.checked)}
          />
          <p className="text-xs text-slate-500">
            {tr("En la tableta, inicia sesión con cualquier usuario de este negocio y abre {url}.", {
              url: "/pantalla-cliente",
            })}
          </p>
        </div>
      </Modal>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          setScannerOpen(false);
          if (!addByCode(code)) {
            setSearch(code);
            toast.error(t("pos.notFoundCode", { code }));
          }
        }}
      />

      <Modal
        open={completed !== null}
        onClose={() => setCompleted(null)}
        title={completed?.offline ? t("pos.saleOffline") : t("pos.saleDone")}
      >
        {completed && (
          <div className="space-y-4 text-center">
            {completed.sale && (
              <p className="text-sm text-slate-500">
                {t("pos.ticket")} #{completed.sale.folio}
              </p>
            )}
            <p className="text-3xl font-bold text-slate-900">{fmt.money(completed.total)}</p>
            {completed.change > 0 && (
              <p className="text-lg font-semibold text-brand-600">
                {tr("Cambio:")} {fmt.money(completed.change)}
              </p>
            )}
            {completed.offline && <p className="text-sm text-slate-500">{t("pos.offlineNote")}</p>}
            <div className="grid grid-cols-2 gap-2">
              {completed.sale && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => window.open(`/ventas/${completed.sale!.id}/ticket`, "_blank")}
                  >
                    <Printer className="w-4 h-4" /> {t("pos.print")}
                  </Button>
                  <a
                    className="inline-flex items-center justify-center gap-2 font-medium px-4 py-2.5 text-sm rounded-xl bg-surface text-slate-700 border border-slate-200 hover:bg-slate-50"
                    href={whatsappLink(
                      buildReceiptText(completed.sale, business),
                      completed.sale.customer?.phone,
                      business.locale
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Share2 className="w-4 h-4" /> {tr("WhatsApp")}
                  </a>
                </>
              )}
            </div>
            <Button className="w-full" onClick={() => setCompleted(null)}>
              {t("pos.newSale")}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
