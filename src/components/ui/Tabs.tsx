"use client";

import { cn } from "@/lib/utils";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
            value === t.value
              ? "border-brand-600 text-brand-700 dark:text-brand-300"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
