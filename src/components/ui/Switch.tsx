"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Interruptor de encendido y apagado (role="switch"): se activa con clic, Espacio o Enter. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  busy,
  size = "md",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nombre accesible: qué se enciende ("Recetas en el plan Pro") */
  label: string;
  disabled?: boolean;
  /** Guardando: se ve atenuado y no acepta otro clic */
  busy?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed",
        size === "sm" ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-brand-600" : "bg-slate-500",
        (disabled || busy) && "opacity-60"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block rounded-full bg-white shadow transition-transform",
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          checked ? (size === "sm" ? "translate-x-4.5" : "translate-x-5.5") : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Descripción accesible más larga ("Según el plan: activa") */
  title?: string;
}

/**
 * Control segmentado (radiogroup): una sola parada de Tab; las flechas cambian la opción.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  tone = (v) => (v === value ? "bg-surface text-slate-900 shadow-sm" : "text-slate-600"),
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  tone?: (value: T) => string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.title}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60",
              tone(o.value)
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
