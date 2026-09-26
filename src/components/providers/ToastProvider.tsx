"use client";

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
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    info: (m) => push("info", m),
    error: (m) => push("error", m instanceof Error ? m.message : typeof m === "string" ? m : "Ocurrió un error"),
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
                "pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm animate-in border",
                t.kind === "success" && "bg-brand-600 text-white border-brand-700",
                t.kind === "error" && "bg-red-600 text-white border-red-700",
                t.kind === "info" && "bg-slate-800 text-white border-slate-900"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <p className="flex-1">{t.message}</p>
              <button
                aria-label="Cerrar"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                className="opacity-80 hover:opacity-100"
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
