"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  ChefHat,
  ChevronDown,
  Coins,
  FileText,
  Gift,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, type SessionBusiness } from "@/components/providers/SessionProvider";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import { useOnline } from "@/lib/client/hooks";
import { TranslationFeedbackButton } from "./TranslationFeedbackButton";
import { OfflineSync } from "@/components/pwa/OfflineSync";
import { clearOfflineData } from "@/lib/client/offline-db";
import { useT, useText } from "@/lib/client/i18n";
import type { MessageKey } from "@/lib/i18n";

type Role = "OWNER" | "CASHIER";
interface NavItem {
  href: string;
  label: MessageKey;
  icon: typeof Store;
  roles: Role[];
  /** Solo se muestra si la función del negocio está activa */
  when?: (business: SessionBusiness) => boolean;
  /** Contador que se muestra junto al enlace */
  badge?: "orders";
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "nav.home" as MessageKey, icon: LayoutDashboard, roles: ["OWNER"] },
  { href: "/ventas", label: "nav.sell" as MessageKey, icon: ShoppingCart, roles: ["OWNER", "CASHIER"] },
  { href: "/ventas/historial", label: "nav.sales" as MessageKey, icon: Receipt, roles: ["OWNER", "CASHIER"] },
  { href: "/caja", label: "nav.cash" as MessageKey, icon: Wallet, roles: ["OWNER", "CASHIER"] },
  {
    href: "/pedidos",
    label: "nav.orders" as MessageKey,
    icon: Inbox,
    roles: ["OWNER", "CASHIER"],
    when: (b) => b.catalogEnabled,
    badge: "orders",
  },
  { href: "/inventario", label: "nav.inventory" as MessageKey, icon: Package, roles: ["OWNER", "CASHIER"] },
  { href: "/vales", label: "nav.giftCards" as MessageKey, icon: Gift, roles: ["OWNER", "CASHIER"] },
  {
    href: "/cocina",
    label: "nav.kitchen" as MessageKey,
    icon: ChefHat,
    roles: ["OWNER", "CASHIER"],
    when: (b) => b.restaurantMode,
  },
  { href: "/clientes", label: "nav.customers" as MessageKey, icon: Users, roles: ["OWNER", "CASHIER"] },
  { href: "/compras", label: "nav.purchases" as MessageKey, icon: ShoppingBag, roles: ["OWNER"] },
  { href: "/promociones", label: "nav.promotions" as MessageKey, icon: Tag, roles: ["OWNER"] },
  { href: "/proveedores", label: "nav.suppliers" as MessageKey, icon: Truck, roles: ["OWNER"] },
  { href: "/gastos", label: "nav.expenses" as MessageKey, icon: Coins, roles: ["OWNER"] },
  { href: "/reportes", label: "nav.reports" as MessageKey, icon: BarChart3, roles: ["OWNER"] },
  { href: "/facturas", label: "nav.invoices" as MessageKey, icon: FileText, roles: ["OWNER"] },
  { href: "/configuracion", label: "nav.settings" as MessageKey, icon: Settings, roles: ["OWNER", "CASHIER"] },
];

const mobilePrimary: Record<Role, string[]> = {
  OWNER: ["/dashboard", "/ventas", "/inventario", "/caja"],
  CASHIER: ["/ventas", "/ventas/historial", "/caja", "/clientes"],
};

function isActive(pathname: string, href: string) {
  if (href === "/ventas") return pathname === "/ventas";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const tr = useText();
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, business, businesses } = useSession();
  const online = useOnline();
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // El idioma de la página sigue al del usuario para que el lector de pantalla pronuncie bien (WCAG 3.1.1).
  useEffect(() => {
    document.documentElement.lang = user.language === "zh" ? "zh-Hans" : user.language;
  }, [user.language]);

  const items = navItems.filter((i) => i.roles.includes(role) && (!i.when || i.when(business)));
  const { data: orderCounts } = useSWR<{ new: number }>(
    business.catalogEnabled ? "/api/orders/summary" : null,
    fetcher,
    {
      refreshInterval: 30_000,
    }
  );
  const badgeFor = (item: NavItem) => (item.badge === "orders" ? (orderCounts?.new ?? 0) : 0);
  const primary = items.filter((i) => mobilePrimary[role].includes(i.href));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Borra la copia local (catálogo, ventas en cola) y las páginas guardadas del usuario.
    await clearOfflineData();
    navigator.serviceWorker?.controller?.postMessage("clear-user-data");
    router.push("/login");
    router.refresh();
  }

  async function switchBusiness(businessId: string) {
    setSwitcherOpen(false);
    if (businessId === business.id) return;
    const res = await fetch("/api/auth/switch-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    if (res.ok) {
      const { role: newRole } = await res.json();
      window.location.assign(newRole === "OWNER" ? "/dashboard" : "/ventas");
    }
  }

  const businessSwitcher = (
    <div className="relative">
      <button
        onClick={() => businesses.length > 1 && setSwitcherOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 text-xs text-slate-500 max-w-[180px]",
          businesses.length > 1 && "hover:text-slate-700"
        )}
        aria-haspopup={businesses.length > 1 ? "listbox" : undefined}
        aria-expanded={switcherOpen}
      >
        <span className="truncate">{business.name}</span>
        {businesses.length > 1 && <ChevronDown className="w-3 h-3 shrink-0" />}
      </button>
      {switcherOpen && (
        <div
          role="listbox"
          className="absolute left-0 top-6 z-50 w-56 bg-surface border border-slate-200 rounded-xl shadow-lg p-1"
        >
          {businesses.map((b) => (
            <button
              key={b.id}
              role="option"
              aria-selected={b.id === business.id}
              onClick={() => switchBusiness(b.id)}
              className={cn(
                "w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50",
                b.id === business.id && "font-semibold text-brand-700 dark:text-brand-300"
              )}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const logo = (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
        <Store className="w-4 h-4 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-sm text-brand-800">ComercioClaro</p>
        {businessSwitcher}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0 md:flex-row">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-surface">
        {tr("Ir al contenido")}
      </a>
      <aside className="hidden md:flex md:w-64 md:flex-col bg-surface border-r border-slate-100 fixed inset-y-0 left-0">
        <div className="p-5 border-b border-slate-100">{logo}</div>
        <nav aria-label={tr("Principal")} className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-brand-50 text-brand-700 dark:text-brand-300"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              {t(item.label)}
              {badgeFor(item) > 0 && (
                <span className="ml-auto min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                  {badgeFor(item)}
                  <span className="sr-only"> {tr("nuevos")}</span>
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <p className="px-3 pb-2 text-xs text-slate-500 truncate">
            {user.name} · {t(`role.${role}`)}
          </p>
          <TranslationFeedbackButton className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 w-full transition-colors" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 w-full transition-colors"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64 min-w-0">
        <header className="md:hidden sticky top-0 z-40 bg-surface border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            {logo}
            <button onClick={handleLogout} aria-label={t("nav.logout")} className="p-2 hover:bg-slate-100 rounded-xl">
              <LogOut className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </header>

        {!online && (
          <div role="status" className="bg-amber-50 text-amber-800 text-sm px-4 py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4" aria-hidden="true" />
            {t("offline.banner")}
          </div>
        )}
        <OfflineSync />

        <main id="contenido" className="px-4 py-5 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>

      <nav
        aria-label={tr("Principal")}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-slate-100 z-40 safe-area-bottom"
      >
        <div className="flex justify-around items-center px-1 py-1">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl min-w-0 flex-1 transition-colors",
                isActive(pathname, item.href) ? "text-brand-600" : "text-slate-500"
              )}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium truncate">{t(item.label)}</span>
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl min-w-0 flex-1 text-slate-500"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] font-medium">{t("nav.more")}</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-surface rounded-t-2xl p-4 animate-in safe-area-bottom">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-slate-900">{t("nav.menu")}</p>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={tr("Cerrar")}
                className="p-2 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "relative flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium",
                    isActive(pathname, item.href)
                      ? "bg-brand-50 text-brand-700 dark:text-brand-300"
                      : "text-slate-600 bg-slate-50"
                  )}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {t(item.label)}
                  {badgeFor(item) > 0 && (
                    <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {badgeFor(item)}
                      <span className="sr-only"> {tr("nuevos")}</span>
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
