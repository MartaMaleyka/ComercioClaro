import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { TERMS_VERSION } from "@/lib/business-types";

/** Página legal pública (términos, privacidad) con el mismo aspecto que el registro. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-secondary px-4 py-8">
      <article className="max-w-3xl mx-auto bg-surface rounded-2xl border border-slate-100 p-6 sm:p-8 space-y-4 text-slate-700 text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <Link href="/registro" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver al registro
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-xs text-slate-500">Versión {TERMS_VERSION}</p>
          </div>
        </div>
        {children}
      </article>
    </main>
  );
}

export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "soporte@comercioclaro.app";
