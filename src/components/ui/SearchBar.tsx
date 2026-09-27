"use client";

import { useText } from "@/lib/client/i18n";
import { forwardRef } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onChange, placeholder, onEnter, autoFocus },
  ref
) {
  const tr = useText();
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={value}
        autoFocus={autoFocus}
        aria-label={placeholder ?? tr("Buscar...")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder ?? tr("Buscar...")}
        className="w-full min-h-12 pl-11 pr-11 py-2.5 bg-surface border-[1.5px] border-slate-300 rounded-xl text-base text-slate-900 placeholder:text-slate-500 hover:border-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-600/15 focus:border-brand-600 transition-[border-color,box-shadow] duration-150 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label={tr("Limpiar búsqueda")}
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      )}
    </div>
  );
});
