"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Maximize, Store } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { DISPLAY_CHANNEL, IDLE_STATE, type DisplayState } from "@/lib/display";
import { useSession } from "@/components/providers/SessionProvider";

/** Segundos que se muestra el "gracias" antes de volver a la bienvenida. */
const THANKS_SECONDS = 10;

/**
 * Pantalla para el cliente: lo que se cobra, el total y el QR de Yappy.
 * Recibe el estado del punto de venta por BroadcastChannel (mismo equipo) o del servidor (otro equipo).
 */
export function CustomerDisplay() {
  const tr = useText();
  const fmt = useFormat();
  const { business, user } = useSession();
  const [local, setLocal] = useState<DisplayState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { data: remote } = useSWR<{ state: DisplayState } | null>("/api/display", fetcher, {
    refreshInterval: 1500,
    dedupingInterval: 1000,
  });
  const { data: yappy } = useSWR<{ directory: string | null; qr: string | null }>("/api/business/yappy", fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    document.documentElement.lang = user.language === "zh" ? "zh-Hans" : user.language;
  }, [user.language]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(DISPLAY_CHANNEL);
    channel.onmessage = (e: MessageEvent<DisplayState>) => setLocal(e.data);
    return () => channel.close();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const candidates = [local, remote?.state].filter((s): s is DisplayState => Boolean(s));
  const latest = candidates.sort((a, b) => b.at - a.at)[0] ?? IDLE_STATE;
  const state = latest.status === "done" && now - latest.at > THANKS_SECONDS * 1000 ? IDLE_STATE : latest;

  return (
    <main className="min-h-screen flex flex-col bg-surface-secondary text-slate-900">
      <header className="flex items-center justify-between gap-3 px-6 py-4 bg-brand-600 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <Store className="w-7 h-7 shrink-0" aria-hidden="true" />
          <h1 className="text-2xl font-bold truncate">{business.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="p-2.5 rounded-xl hover:bg-white/15"
          aria-label={tr("Pantalla completa")}
        >
          <Maximize className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>

      {state.status === "idle" ? (
        <section className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
          <p className="text-4xl font-bold">{tr("¡Bienvenido!")}</p>
          <p className="text-xl text-slate-600">{tr("Aquí verás tu compra mientras te atendemos.")}</p>
        </section>
      ) : state.status === "done" ? (
        <section className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-8" aria-live="polite">
          <p className="text-5xl font-bold text-brand-600">{tr("¡Gracias por su compra!")}</p>
          <p className="text-3xl tabular-nums">
            {tr("Total")}: {fmt.money(state.total)}
          </p>
          {state.change > 0 && (
            <p className="text-3xl font-semibold tabular-nums">
              {tr("Su cambio")}: {fmt.money(state.change)}
            </p>
          )}
          {state.points != null && state.points > 0 && (
            <p className="text-xl text-slate-600">{tr("Tienes {n} puntos", { n: state.points })}</p>
          )}
        </section>
      ) : (
        <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6 p-6 min-h-0">
          <section
            aria-labelledby="compra"
            className="bg-surface rounded-2xl border border-slate-100 p-5 overflow-y-auto"
          >
            <h2 id="compra" className="text-lg font-semibold text-slate-700 mb-3">
              {tr("Tu compra")}
              {state.customerName && <span className="font-normal text-slate-500"> · {state.customerName}</span>}
            </h2>
            <ul className="divide-y divide-slate-100 text-xl">
              {state.lines.map((l, i) => (
                <li key={i} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-base text-slate-500">{fmt.qty(l.quantity, l.unit)}</p>
                    {l.promotion && <p className="text-base text-brand-600">{l.promotion}</p>}
                  </div>
                  <p className="font-semibold tabular-nums whitespace-nowrap">{fmt.money(l.total)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={tr("Total a pagar")} className="flex flex-col gap-4">
            <div
              className="bg-surface rounded-2xl border border-slate-100 p-6 space-y-2"
              aria-live="polite"
              aria-atomic="true"
            >
              {state.discount > 0 && (
                <p className="flex justify-between text-xl text-slate-600">
                  <span>{tr("Ahorro")}</span>
                  <span className="tabular-nums">−{fmt.money(state.discount)}</span>
                </p>
              )}
              <p className="text-lg text-slate-600">{tr("Total a pagar")}</p>
              <p className="text-6xl font-bold tabular-nums">{fmt.money(state.total)}</p>
              {state.points != null && (
                <p className="text-lg text-slate-600">{tr("Tienes {n} puntos", { n: state.points })}</p>
              )}
            </div>
            {state.paymentMethod === "YAPPY" && (yappy?.qr || yappy?.directory) && (
              <div className="bg-surface rounded-2xl border border-slate-100 p-6 text-center space-y-3">
                <p className="text-xl font-semibold">{tr("Paga con Yappy")}</p>
                {yappy.qr && (
                  // eslint-disable-next-line @next/next/no-img-element -- el QR es una data URL subida por el comercio
                  <img
                    src={yappy.qr}
                    alt={tr("QR de Yappy del comercio")}
                    className="mx-auto w-64 h-64 object-contain"
                  />
                )}
                {yappy.directory && (
                  <p className="text-lg text-slate-600">
                    {tr("Directorio")}: <span className="font-semibold text-slate-900">{yappy.directory}</span>
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
