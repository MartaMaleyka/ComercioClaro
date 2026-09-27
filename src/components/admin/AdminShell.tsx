"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, CreditCard, History, LayoutDashboard, LogOut, ShieldCheck, Store, Users } from "lucide-react";
import { LanguageContext, useText } from "@/lib/client/i18n";
import { clearOfflineData } from "@/lib/client/offline-db";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/negocios", label: "Negocios", icon: Building2 },
  { href: "/admin/planes", label: "Planes y precios", icon: CreditCard },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/bitacora", label: "Bitácora", icon: History },
];

export function AdminShell(props: {
  admin: { name: string; email: string; language: string };
  hasBusiness: boolean;
  children: React.ReactNode;
}) {
  return (
    <LanguageContext.Provider value={props.admin.language}>
      <Shell {...props} />
    </LanguageContext.Provider>
  );
}

function Shell({
  admin,
  hasBusiness,
  children,
}: {
  admin: { name: string; email: string };
  hasBusiness: boolean;
  children: React.ReactNode;
}) {
  const tr = useText();
  const pathname = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await clearOfflineData().catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-surface">
        {tr("Ir al contenido")}
      </a>
      <header className="bg-surface border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-purple-700 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900">{tr("Administración de ComercioClaro")}</p>
              <p className="text-xs text-slate-500">
                {admin.name} · {admin.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasBusiness && (
              <Link
                href="/inicio"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Store className="w-4 h-4" aria-hidden="true" /> {tr("Ir a mi negocio")}
              </Link>
            )}
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar sesión")}
            </button>
          </div>
        </div>
        <nav aria-label={tr("Administración")} className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap",
                active(item.href)
                  ? "border-purple-700 text-purple-800 dark:text-purple-300"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              )}
            >
              <item.icon className="w-4 h-4" aria-hidden="true" />
              {tr(item.label)}
            </Link>
          ))}
        </nav>
      </header>
      <main id="contenido" className="max-w-6xl mx-auto px-4 py-5">
        {children}
      </main>
    </div>
  );
}
