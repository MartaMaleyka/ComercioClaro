"use client";

import { useText } from "@/lib/client/i18n";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string | unknown) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const tr = useText();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 10000 : 5000);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    info: (m) => push("info", m),
    error: (m) => push("error", m instanceof Error ? m.message : typeof m === "string" ? m : tr("Ocurrió un error")),
  };

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[60] bottom-24 md:bottom-6 inset-x-4 md:left-auto md:right-6 md:w-96 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-2xl pl-3 pr-3 py-3 shadow-xl text-[15px] font-medium animate-in bg-ink text-white border",
                t.kind === "error" ? "border-red-600" : "border-ink-line"
              )}
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  t.kind === "success" && "bg-brand-600",
                  t.kind === "error" && "bg-red-600",
                  t.kind === "info" && "bg-blue-600"
                )}
                aria-hidden="true"
              >
                <Icon className="w-5 h-5" />
              </span>
              <p className="flex-1">{t.message}</p>
              <button
                aria-label={tr("Cerrar")}
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
