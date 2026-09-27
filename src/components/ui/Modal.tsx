"use client";

import { useText } from "@/lib/client/i18n";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const tr = useText();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Mientras está cerrado recuerda el último control enfocado: ese es el que abre el diálogo.
  // (No basta con leer document.activeElement al abrir: un campo con autoFocus ya tomó el foco).
  useEffect(() => {
    if (open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Ignora el foco que entra a este mismo diálogo al montarse.
      if (target.closest?.(`[aria-labelledby="${CSS.escape(titleId)}"]`)) return;
      openerRef.current = target;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [open, titleId]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    // Devuelve el foco al control que abrió el diálogo al cerrar (WCAG 2.4.3).
    const opener = openerRef.current;
    document.body.style.overflow = "hidden";

    // Foco inicial: el control con autoFocus o el primer campo; si no hay, el propio diálogo.
    if (dialog && !dialog.contains(document.activeElement)) {
      const first =
        dialog.querySelector<HTMLElement>("[autofocus]") ??
        dialog.querySelector<HTMLElement>("input, select, textarea") ??
        dialog;
      first.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (!dialog) return;
      // Con diálogos anidados solo responde el de arriba.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Mantiene el foco dentro del diálogo.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-surface rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-y-auto animate-in focus:outline-none",
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
      >
        <div className="sticky top-0 z-10 bg-surface px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-slate-100 flex items-center justify-between rounded-t-3xl">
          <span className="sm:hidden absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
          <h2 id={titleId} className="text-xl font-bold text-slate-900 pt-2 sm:pt-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("Cerrar")}
            className="press p-2.5 -mr-1 hover:bg-slate-100 rounded-xl"
          >
            <X className="w-5 h-5 text-slate-500" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 sm:px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
