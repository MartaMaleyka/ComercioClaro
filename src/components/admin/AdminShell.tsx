"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
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
      <header className="bg-ink text-ink-text [&_:focus-visible]:outline-mango-400">
        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-mango-400 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-5 h-5 text-ink" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display font-extrabold text-[15px] text-white">{tr("Administración de ComercioClaro")}</p>
              <p className="text-xs text-ink-muted">
                {admin.name} · {admin.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasBusiness && (
              <Link
                href="/inicio"
                className="press inline-flex items-center gap-2 px-3 min-h-10 text-sm font-medium rounded-xl border border-ink-line text-white hover:bg-white/[0.06]"
              >
                <Store className="w-4 h-4" aria-hidden="true" /> {tr("Ir a mi negocio")}
              </Link>
            )}
            <Link
              href="/seguridad"
              className="press inline-flex items-center gap-2 px-3 min-h-10 text-sm font-medium rounded-xl border border-ink-line text-white hover:bg-white/[0.06]"
            >
              <KeyRound className="w-4 h-4" aria-hidden="true" /> {tr("Seguridad")}
            </Link>
            <button
              onClick={logout}
              className="press inline-flex items-center gap-2 px-3 min-h-10 text-sm font-medium rounded-xl text-ink-text hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar sesión")}
            </button>
          </div>
        </div>
        <nav aria-label={tr("Administración")} className="max-w-6xl mx-auto px-4 md:px-8 pb-3 flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={cn(
                "press flex items-center gap-2 px-3.5 min-h-10 rounded-xl text-sm font-semibold whitespace-nowrap",
                active(item.href) ? "bg-white text-ink shadow-sm" : "text-ink-text hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <item.icon className="w-4 h-4" aria-hidden="true" />
              {tr(item.label)}
            </Link>
          ))}
        </nav>
      </header>
      <main id="contenido" className="max-w-6xl mx-auto px-4 py-5 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
