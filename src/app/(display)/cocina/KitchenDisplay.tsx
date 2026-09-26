"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, ChefHat } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { modifierText } from "@/lib/client/receipt";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

type Status = "PENDING" | "PREPARING" | "READY" | "SERVED";

interface KitchenOrder {
  id: string;
  number: number;
  label: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  items: {
    id: string;
    quantity: number;
    notes: string | null;
    modifiers: { name: string }[] | null;
    kitchenStatus: Status;
    createdAt: string;
    product: { name: string; unit: string };
  }[];
}

const NEXT: Record<Status, Status> = { PENDING: "PREPARING", PREPARING: "READY", READY: "SERVED", SERVED: "SERVED" };
const ACTION: Record<Status, string> = { PENDING: "Preparar", PREPARING: "Listo", READY: "Servido", SERVED: "Servido" };
const LABEL: Record<Status, string> = {
  PENDING: "Pendiente",
  PREPARING: "Preparando",
  READY: "Listo para servir",
  SERVED: "Servido",
};

/** Pantalla de cocina: platillos por cuenta, con tiempo de espera y estado. */
export function KitchenDisplay() {
  const tr = useText();
  const fmt = useFormat();
  const { user, role } = useSession();
  const { data, mutate } = useSWR<KitchenOrder[]>("/api/kitchen", fetcher, { refreshInterval: 3000 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.documentElement.lang = user.language === "zh" ? "zh-Hans" : user.language;
  }, [user.language]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  async function advance(itemId: string, status: Status) {
    // Actualización optimista: la cocina ve el cambio al instante.
    mutate(
      (orders) =>
        orders
          ?.map((o) => ({
            ...o,
            items: o.items
              .map((i) => (i.id === itemId ? { ...i, kitchenStatus: NEXT[status] } : i))
              .filter((i) => i.kitchenStatus !== "SERVED"),
          }))
          .filter((o) => o.items.length > 0),
      { revalidate: false }
    );
    try {
      await api(`/api/kitchen/items/${itemId}`, { method: "PATCH", body: { status: NEXT[status] } });
    } finally {
      mutate();
    }
  }

  const minutes = (date: string) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
  const pending = data?.reduce((acc, o) => acc + o.items.length, 0) ?? 0;

  return (
    <main className="min-h-screen bg-surface-secondary p-4">
      <header className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ChefHat className="w-7 h-7" aria-hidden="true" /> {tr("Cocina")}
        </h1>
        <p className="text-slate-600" aria-live="polite">
          {tr("{n} platillos por preparar", { n: pending })}
        </p>
        <Link
          href={role === "OWNER" ? "/dashboard" : "/ventas"}
          className="flex items-center gap-1 text-sm underline text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {tr("Volver")}
        </Link>
      </header>
      {data && data.length === 0 && <p className="text-center text-xl text-slate-500 py-20">{tr("Todo en orden")}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.map((o) => {
          const wait = minutes(o.items[0]?.createdAt ?? o.createdAt);
          return (
            <li key={o.id}>
              <section
                aria-labelledby={`orden-${o.id}`}
                className={cn(
                  "rounded-2xl border-2 bg-surface overflow-hidden",
                  wait >= 20 ? "border-red-600" : wait >= 10 ? "border-amber-500" : "border-brand-600"
                )}
              >
                <div
                  className={cn(
                    "px-4 py-2 flex justify-between items-center text-white",
                    wait >= 20 ? "bg-red-600" : wait >= 10 ? "bg-amber-700" : "bg-brand-600"
                  )}
                >
                  <h2 id={`orden-${o.id}`} className="font-bold text-lg">
                    {o.label}
                  </h2>
                  <span className="text-sm tabular-nums">
                    #{o.number} · {tr("{n} min", { n: wait })}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {o.items.map((i) => (
                    <li key={i.id} className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-lg">
                          {fmt.number(i.quantity)} × {i.product.name}
                        </p>
                        {i.modifiers && i.modifiers.length > 0 && (
                          <p className="text-sm text-slate-700">{modifierText(i.modifiers)}</p>
                        )}
                        {i.notes && <p className="text-sm font-medium text-red-600">{i.notes}</p>}
                        <p className="text-xs text-slate-500">{tr(LABEL[i.kitchenStatus])}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => advance(i.id, i.kitchenStatus)}
                        className={cn(
                          "shrink-0 min-h-11 px-4 rounded-xl font-semibold text-white",
                          i.kitchenStatus === "PENDING"
                            ? "bg-slate-700"
                            : i.kitchenStatus === "PREPARING"
                              ? "bg-brand-600"
                              : "bg-blue-700"
                        )}
                      >
                        {tr(ACTION[i.kitchenStatus])}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
