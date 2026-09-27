"use client";

import { useEffect } from "react";

export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold">
      Imprimir
    </button>
  );
}
