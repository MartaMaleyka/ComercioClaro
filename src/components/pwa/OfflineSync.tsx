"use client";

import { useText } from "@/lib/client/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CloudUpload, Trash2 } from "lucide-react";
import { api, ApiError, isNetworkError } from "@/lib/client/api";
import {
  listFailed,
  listPending,
  moveToFailed,
  QUEUE_EVENT,
  removeFailed,
  removePending,
  type PendingSale,
} from "@/lib/client/offline-db";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useFormat } from "@/lib/client/format";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/** Envía las ventas guardadas sin conexión cuando vuelve la red. */
export function OfflineSync() {
  const tr = useText();
  const { business } = useSession();
  const toast = useToast();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const syncing = useRef(false);

  const { data, mutate: refresh } = useSWR(["offline-queue", business.id], async () => {
    try {
      const [p, f] = await Promise.all([listPending(), listFailed()]);
      return {
        pending: p.filter((s) => s.businessId === business.id),
        failed: f.filter((s) => s.businessId === business.id),
        checkedAt: Date.now(),
      };
    } catch {
      // IndexedDB no disponible (modo privado): la venta sin conexión no aplica.
      return { pending: [] as PendingSale[], failed: [] as PendingSale[], checkedAt: 0 };
    }
  });
  const pending = data?.pending ?? [];
  const failed = data?.failed ?? [];
  // En el interior la señal puede faltar por días: se avisa cuánto lleva guardada la venta más antigua
  // y cuánto falta para que el servidor deje de respetar su fecha.
  const oldest = pending.reduce<string | null>(
    (acc, s) => (acc === null || s.createdAt < acc ? s.createdAt : acc),
    null
  );
  const ageDays = oldest && data ? Math.floor((data.checkedAt - new Date(oldest).getTime()) / 86_400_000) : 0;
  const daysLeft = business.offlineDays - ageDays;

  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    let sent = 0;
    try {
      const queue = (await listPending()).filter((s) => s.businessId === business.id);
      for (const sale of queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        try {
          await api("/api/sales", { body: sale.payload });
          await removePending(sale.clientRequestId);
          sent++;
        } catch (err) {
          if (isNetworkError(err)) break;
          // 401 (sesión vencida) y 403 (negocio suspendido o prueba vencida) no son errores de la venta:
          // se queda pendiente hasta que se pueda enviar.
          if (
            err instanceof ApiError &&
            err.status >= 400 &&
            err.status < 500 &&
            err.status !== 401 &&
            err.status !== 403
          ) {
            await moveToFailed(sale, err.message);
          } else break;
        }
      }
    } finally {
      syncing.current = false;
      if (sent > 0) toast.success(tr("{n} venta(s) sin conexión sincronizada(s)", { n: sent }));
      refresh();
    }
  }, [business.id, refresh, toast, tr]);

  useEffect(() => {
    sync();
    const onChange = () => refresh();
    window.addEventListener(QUEUE_EVENT, onChange);
    window.addEventListener("online", sync);
    const interval = setInterval(sync, 60_000);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onChange);
      window.removeEventListener("online", sync);
      clearInterval(interval);
    };
  }, [refresh, sync]);

  if (pending.length === 0 && failed.length === 0) return null;

  return (
    <>
      <div className="bg-blue-50 text-blue-700 text-sm px-4 py-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CloudUpload className="w-4 h-4" aria-hidden="true" />
          {pending.length > 0 && tr("{n} venta(s) pendiente(s) de enviar. ", { n: pending.length })}
          {failed.length > 0 && (
            <span className="text-red-700 font-medium">{tr("{n} con error.", { n: failed.length })}</span>
          )}
          {ageDays >= 1 && (
            <span className={daysLeft <= 2 ? "text-red-700 font-medium" : "text-amber-700 font-medium"}>
              {daysLeft > 0
                ? tr("La más antigua lleva {days} día(s) sin enviarse; conéctate en menos de {left} día(s).", {
                    days: ageDays,
                    left: daysLeft,
                  })
                : tr("La más antigua lleva {days} día(s) sin enviarse: se registrará con la fecha de envío.", {
                    days: ageDays,
                  })}
            </span>
          )}
        </span>
        <span className="flex gap-3">
          {pending.length > 0 && (
            <button onClick={sync} className="font-medium underline">
              {tr("Sincronizar")}
            </button>
          )}
          <button onClick={() => setOpen(true)} className="font-medium underline">
            {tr("Ver")}
          </button>
        </span>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Ventas sin conexión")}>
        <div className="space-y-4">
          {pending.map((s) => (
            <div key={s.clientRequestId} className="flex justify-between text-sm">
              <span>{fmt.dateTime(s.createdAt)}</span>
              <span className="font-medium">
                {fmt.money(s.total)} {tr("· pendiente")}
              </span>
            </div>
          ))}
          {failed.map((s) => (
            <div key={s.clientRequestId} className="rounded-xl bg-red-50 p-3 text-sm space-y-2">
              <div className="flex justify-between">
                <span>{fmt.dateTime(s.createdAt)}</span>
                <span className="font-medium">{fmt.money(s.total)}</span>
              </div>
              <p className="text-red-700 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {s.error}
              </p>
              <Button size="sm" variant="secondary" onClick={() => removeFailed(s.clientRequestId)}>
                <Trash2 className="w-4 h-4" /> {tr("Descartar")}
              </Button>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            {tr("Las ventas rechazadas no afectaron el inventario. Regístralas de nuevo si corresponde.")}
          </p>
        </div>
      </Modal>
    </>
  );
}
