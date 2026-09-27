"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Pestañas con el patrón ARIA: flechas, Inicio y Fin mueven entre pestañas (una sola parada de Tab). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto p-1 bg-slate-100 rounded-2xl max-w-full w-fit">
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cn(
            "press px-4 min-h-10 rounded-xl text-sm font-semibold whitespace-nowrap",
            value === t.value
              ? "bg-surface text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-surface/60"
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="ml-1.5 text-xs bg-brand-600 text-white rounded-full px-1.5 py-px">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
