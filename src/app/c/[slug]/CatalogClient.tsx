"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBag, Store } from "lucide-react";
import { formatCurrency, UNIT_LABELS, cn } from "@/lib/utils";
import { whatsappLink } from "@/lib/client/receipt";

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  category: string;
  available: boolean;
  promotion: string | null;
}

interface CatalogBusiness {
  name: string;
  description: string | null;
  address: string | null;
  whatsapp: string | null;
  currency: string;
  locale: string;
  showBalboa: boolean;
}

export interface CatalogZone {
  name: string;
  fee: number;
}

export function CatalogClient({
  slug,
  business,
  zones,
  products,
}: {
  slug: string;
  business: CatalogBusiness;
  zones: CatalogZone[];
  products: CatalogProduct[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const money = (n: number) => formatCurrency(n, business.currency, business.locale, business.showBalboa);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const filtered = products.filter(
    (p) => (!category || p.category === category) && (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );
  const lines = products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] }));
  const zone = delivery ? zones.find((z) => z.name === zoneName) : undefined;
  const total = lines.reduce((acc, l) => acc + l.qty * l.price, 0) + (zone?.fee ?? 0);

  const change = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const buildMessage = (orderNumber: number | null) =>
    [
      orderNumber
        ? `Hola ${business.name}, hice el pedido #${orderNumber}:`
        : `Hola ${business.name}, quiero hacer un pedido:`,
      "",
      ...lines.map((l) => `• ${l.qty} ${UNIT_LABELS[l.unit] ?? ""} ${l.name} (${money(l.price)})`),
      zone ? `• Entrega · ${zone.name} (${money(zone.fee)})` : null,
      "",
      `Total aproximado: ${money(total)}`,
      name ? `Nombre: ${name}` : null,
      delivery ? `Entrega a domicilio: ${address || "(dirección por confirmar)"}` : "Recojo en la tienda",
      note ? `Nota: ${note}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");

  /** Guarda el pedido en la bandeja del negocio y abre WhatsApp con el número de pedido. */
  async function sendOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (delivery && zones.length > 0 && !zone) {
      setError("Elige la zona de entrega");
      return;
    }
    // Se abre la ventana antes de esperar a la red para que el navegador no la bloquee.
    const whatsappWindow = window.open("", "_blank");
    setSending(true);
    let orderNumber: number | null = null;
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          phone: phone || null,
          notes: note || null,
          fulfillment: delivery ? "DELIVERY" : "PICKUP",
          address: delivery ? address || null : null,
          deliveryZone: zone?.name ?? null,
          items: lines.map((l) => ({ productId: l.id, quantity: l.qty })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        whatsappWindow?.close();
        setError(data?.error ?? "No se pudo enviar el pedido. Intenta de nuevo.");
        return;
      }
      orderNumber = data.number;
      setSent(orderNumber);
      setCart({});
    } catch {
      // Sin conexión con el negocio: el pedido se envía solo por WhatsApp.
    } finally {
      setSending(false);
    }
    const url = whatsappLink(buildMessage(orderNumber), business.whatsapp, business.locale);
    if (whatsappWindow) whatsappWindow.location.href = url;
    else window.location.assign(url);
  }

  return (
    <div className="min-h-screen bg-surface-secondary pb-40">
      <header className="bg-brand-600 text-white px-4 py-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-11 h-11 bg-white/15 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{business.name}</h1>
            {business.description && <p className="text-sm">{business.description}</p>}
            {business.address && <p className="text-xs">{business.address}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar producto"
            placeholder="Buscar producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 bg-surface border border-slate-200 rounded-xl text-sm"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["", ...categories].map((c) => (
            <button
              key={c || "all"}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",
                category === c
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-surface text-slate-600 border-slate-200"
              )}
            >
              {c || "Todo"}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="bg-surface rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="text-sm text-brand-700 dark:text-brand-300 font-semibold">
                  {money(p.price)}
                  {p.unit !== "PIECE" && (
                    <span className="text-xs text-slate-500 font-normal"> / {UNIT_LABELS[p.unit]}</span>
                  )}
                </p>
                {p.promotion && <p className="text-xs text-purple-700">{p.promotion}</p>}
                {!p.available && <p className="text-xs text-red-600">Agotado</p>}
              </div>
              {p.available && (
                <div className="flex items-center gap-1 shrink-0">
                  {cart[p.id] ? (
                    <>
                      <button
                        aria-label={`Quitar ${p.name}`}
                        onClick={() => change(p.id, -1)}
                        className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{cart[p.id]}</span>
                    </>
                  ) : null}
                  <button
                    aria-label={`Agregar ${p.name}`}
                    onClick={() => change(p.id, 1)}
                    className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {filtered.length === 0 && <p className="text-center text-sm text-slate-500 py-8">Sin resultados</p>}
      </main>

      {sent !== null && lines.length === 0 && (
        <div
          role="status"
          className="fixed bottom-0 inset-x-0 bg-brand-600 text-white p-4 text-center safe-area-bottom"
        >
          ¡Recibimos tu pedido #{sent}! Te confirmaremos por WhatsApp.
        </div>
      )}

      {lines.length > 0 && (
        <form
          onSubmit={sendOrder}
          className="fixed bottom-0 inset-x-0 bg-surface border-t border-slate-200 p-4 safe-area-bottom"
        >
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Tu nombre"
                placeholder="Tu nombre"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm"
              />
              <input
                aria-label="Tu celular"
                placeholder="Tu celular"
                type="tel"
                inputMode="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <fieldset className="flex gap-4 text-sm text-slate-700">
              <legend className="sr-only">Entrega</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="entrega"
                  checked={!delivery}
                  onChange={() => setDelivery(false)}
                  className="w-4 h-4 accent-brand-600"
                />
                Recojo en la tienda
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="entrega"
                  checked={delivery}
                  onChange={() => setDelivery(true)}
                  className="w-4 h-4 accent-brand-600"
                />
                A domicilio
              </label>
            </fieldset>
            {delivery && zones.length > 0 && (
              <select
                aria-label="Zona de entrega"
                required
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Zona de entrega…</option>
                {zones.map((z) => (
                  <option key={z.name} value={z.name}>
                    {z.name} · {money(z.fee)}
                  </option>
                ))}
              </select>
            )}
            {delivery && (
              <input
                aria-label="Dirección y punto de referencia"
                placeholder="Dirección y punto de referencia (p. ej. frente a la escuela)"
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm"
              />
            )}
            <input
              aria-label="Nota (opcional)"
              placeholder="Nota (opcional)"
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-slate-200 rounded-xl text-sm"
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={sending}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-600 text-white font-semibold disabled:opacity-60"
            >
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
              Enviar pedido por WhatsApp · {money(total)}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              Precios sujetos a disponibilidad; las promociones se aplican al cobrar.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
