"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
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
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  Wallet,
  WifiOff,
  X,
  BookOpen,
  IdCard,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, type SessionBusiness } from "@/components/providers/SessionProvider";
import useSWR from "swr";
import { api, fetcher } from "@/lib/client/api";
import { useOnline } from "@/lib/client/hooks";
import { TranslationFeedbackButton } from "./TranslationFeedbackButton";
import { ThemeSwitch, ThemeToggle } from "@/components/providers/ThemeToggle";
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
  {
    href: "/vales",
    label: "nav.giftCards" as MessageKey,
    icon: Gift,
    roles: ["OWNER", "CASHIER"],
    when: (b) => b.features.includes("giftCards"),
  },
  {
    href: "/cocina",
    label: "nav.kitchen" as MessageKey,
    icon: ChefHat,
    roles: ["OWNER", "CASHIER"],
    when: (b) => b.restaurantMode,
  },
  { href: "/clientes", label: "nav.customers" as MessageKey, icon: Users, roles: ["OWNER", "CASHIER"] },
  { href: "/compras", label: "nav.purchases" as MessageKey, icon: ShoppingBag, roles: ["OWNER"] },
  {
    href: "/promociones",
    label: "nav.promotions" as MessageKey,
    icon: Tag,
    roles: ["OWNER"],
    when: (b) => b.features.includes("promotions"),
  },
  {
    href: "/campanas",
    label: "nav.campaigns" as MessageKey,
    icon: Megaphone,
    roles: ["OWNER"],
    when: (b) => b.features.includes("campaigns"),
  },
  { href: "/proveedores", label: "nav.suppliers" as MessageKey, icon: Truck, roles: ["OWNER"] },
  { href: "/gastos", label: "nav.expenses" as MessageKey, icon: Coins, roles: ["OWNER"] },
  { href: "/reportes", label: "nav.reports" as MessageKey, icon: BarChart3, roles: ["OWNER"] },
  {
    href: "/contabilidad",
    label: "nav.accounting" as MessageKey,
    icon: BookOpen,
    roles: ["OWNER"],
    when: (b) => b.features.includes("accounting"),
  },
  {
    href: "/planilla",
    label: "nav.payroll" as MessageKey,
    icon: IdCard,
    roles: ["OWNER"],
    when: (b) => b.features.includes("payroll"),
  },
  { href: "/facturas", label: "nav.invoices" as MessageKey, icon: FileText, roles: ["OWNER"] },
  { href: "/configuracion", label: "nav.settings" as MessageKey, icon: Settings, roles: ["OWNER", "CASHIER"] },
];

/** Grupos de la barra lateral y del menú "Más" (las funciones apagadas no aparecen). */
const navGroups: { label: string; hrefs: string[] }[] = [
  {
    label: "Día a día",
    hrefs: ["/dashboard", "/ventas", "/ventas/historial", "/caja", "/pedidos", "/cocina", "/vales"],
  },
  {
    label: "Negocio",
    hrefs: ["/inventario", "/clientes", "/compras", "/proveedores", "/promociones", "/campanas"],
  },
  { label: "Finanzas", hrefs: ["/gastos", "/reportes", "/contabilidad", "/planilla", "/facturas"] },
  { label: "Ajustes", hrefs: ["/configuracion"] },
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
  const { user, role, business, businesses, support } = useSession();
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
          "flex items-center gap-1 text-xs text-slate-500 md:text-ink-muted max-w-[180px]",
          businesses.length > 1 && "hover:text-slate-700 md:hover:text-white"
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
          className="absolute left-0 top-6 z-50 w-56 bg-surface-raised border border-slate-200 rounded-2xl shadow-lg p-1 animate-in"
        >
          {businesses.map((b) => (
            <button
              key={b.id}
              role="option"
              aria-selected={b.id === business.id}
              onClick={() => switchBusiness(b.id)}
              className={cn(
                "w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-700 hover:bg-slate-50",
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
    <div className="flex items-center gap-2.5">
      <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
        <Store className="w-5 h-5 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="font-display font-extrabold text-[15px] leading-tight text-slate-900 md:text-white">
          ComercioClaro
        </p>
        {businessSwitcher}
      </div>
    </div>
  );

  const groups = navGroups
    .map((g) => ({ ...g, items: items.filter((i) => g.hrefs.includes(i.href)) }))
    .filter((g) => g.items.length > 0);

  const orderBadge = (item: NavItem, className: string) =>
    badgeFor(item) > 0 && (
      <span
        className={cn(
          "min-w-6 h-6 px-1.5 rounded-full bg-mango-400 text-ink text-xs font-bold flex items-center justify-center animate-[pop_360ms_cubic-bezier(.2,.8,.2,1)]",
          className
        )}
      >
        {badgeFor(item)}
        <span className="sr-only"> {tr("nuevos")}</span>
      </span>
    );

  // En el celular, Vender va al centro y más grande: es lo que más se toca.
  const sell = primary.find((i) => i.href === "/ventas");
  const others = primary.filter((i) => i.href !== "/ventas");
  const bottom = sell ? [...others.slice(0, 2), sell, ...others.slice(2)] : primary;

  return (
    <div className="min-h-screen flex flex-col pb-24 md:pb-0 md:flex-row">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-surface">
        {tr("Ir al contenido")}
      </a>
      <aside className="hidden md:flex md:w-64 md:flex-col bg-ink text-ink-text fixed inset-y-0 left-0 border-r border-ink-line [&_:focus-visible]:outline-mango-400">
        <div className="px-5 pt-5 pb-4">{logo}</div>
        <nav aria-label={tr("Principal")} className="flex-1 px-3 pb-3 overflow-y-auto space-y-5">
          {groups.map((g) => (
            <div key={g.label} className="space-y-0.5">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                {tr(g.label)}
              </p>
              {g.items.map((item) => {
                const on = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "press flex items-center gap-3 px-3 min-h-11 rounded-xl text-[15px] font-medium",
                      on ? "bg-brand-600 text-white shadow-sm" : "text-ink-text hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    {t(item.label)}
                    {orderBadge(item, "ml-auto")}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-ink-line space-y-0.5">
          <div className="flex items-center gap-3 px-3 py-2">
            <span
              className="w-9 h-9 rounded-full bg-ink-soft text-white text-sm font-bold flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              {initials(user.name)}
            </span>
            <p className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold text-white">{user.name}</span>
              <span className="block truncate text-xs text-ink-muted">{t(`role.${role}`)}</span>
            </p>
          </div>
          <ThemeSwitch
            withLabel
            className="flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium text-ink-text hover:bg-white/[0.06] hover:text-white w-full"
          />
          <TranslationFeedbackButton className="press flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium text-ink-text hover:bg-white/[0.06] hover:text-white w-full" />
          <button
            onClick={handleLogout}
            className="press flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium text-ink-text hover:bg-white/[0.06] hover:text-white w-full"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 md:ml-64 min-w-0">
        <header className="md:hidden sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-slate-200/70 px-4 py-2.5">
          <div className="flex items-center justify-between">
            {logo}
            <div className="flex items-center gap-1">
              <ThemeSwitch className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-600" />
              <button
              onClick={handleLogout}
              aria-label={t("nav.logout")}
              className="press p-2.5 hover:bg-slate-100 rounded-xl"
            >
              <LogOut className="w-5 h-5 text-slate-600" />
            </button>
            </div>
          </div>
        </header>

        {!online && (
          <div role="status" className="bg-mango-50 text-mango-800 text-sm font-medium px-4 py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4" aria-hidden="true" />
            {t("offline.banner")}
          </div>
        )}
        <OfflineSync />
        <AccountNotices
          support={support}
          businessName={business.name}
          access={business.access}
          isSuperAdmin={user.isSuperAdmin}
          canPayOnline={role === "OWNER" && business.onlineBilling}
          unverifiedEmail={user.emailVerified || support ? null : user.email}
        />

        <main id="contenido" className="px-4 py-5 md:px-8 md:py-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>

      <nav
        aria-label={tr("Principal")}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-md border-t border-slate-200/70 z-40 safe-area-bottom"
      >
        <div className="flex justify-around items-end px-1 pt-1.5 pb-1">
          {bottom.map((item) => {
            const on = isActive(pathname, item.href);
            const main = item.href === "/ventas";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className="press relative flex flex-col items-center gap-1 min-w-0 flex-1 py-1"
              >
                <span
                  className={cn(
                    "flex items-center justify-center transition-colors",
                    main
                      ? "w-14 h-14 -mt-7 rounded-2xl bg-brand-600 text-white shadow-lg ring-4 ring-surface"
                      : cn("w-14 h-8 rounded-full", on ? "bg-brand-50 text-brand-700 dark:text-brand-300" : "text-slate-600")
                  )}
                >
                  <item.icon className={main ? "w-6 h-6" : "w-5 h-5"} aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold truncate max-w-full",
                    on ? "text-brand-700 dark:text-brand-300" : "text-slate-600"
                  )}
                >
                  {t(item.label)}
                </span>
                {orderBadge(item, "absolute top-0 right-2 min-w-5 h-5 text-[10px]")}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="press flex flex-col items-center gap-1 min-w-0 flex-1 py-1 text-slate-600"
          >
            <span className="w-14 h-8 rounded-full flex items-center justify-center">
              <Menu className="w-5 h-5" aria-hidden="true" />
            </span>
            <span className="text-[11px] font-semibold">{t("nav.more")}</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 max-h-[85vh] overflow-y-auto bg-surface-raised rounded-t-3xl px-4 pt-3 pb-4 shadow-xl animate-in safe-area-bottom">
            <span className="block mx-auto mb-2 w-10 h-1 rounded-full bg-slate-300" aria-hidden="true" />
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-xl font-bold text-slate-900">{t("nav.menu")}</p>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={tr("Cerrar")}
                className="press p-2.5 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{tr(g.label)}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {g.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          "press relative flex flex-col items-center justify-center gap-1.5 min-h-20 p-2 rounded-2xl text-xs font-semibold text-center",
                          isActive(pathname, item.href)
                            ? "bg-brand-600 text-white"
                            : "text-slate-700 bg-slate-100 hover:bg-slate-200/70"
                        )}
                      >
                        <item.icon className="w-6 h-6" aria-hidden="true" />
                        {t(item.label)}
                        {orderBadge(item, "absolute top-1.5 right-1.5 min-w-5 h-5 text-[10px]")}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{tr("Tema")}</p>
                <ThemeToggle className="w-full" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Avisos de la cuenta: soporte del super admin, prueba por terminar y pago vencido. */
function AccountNotices({
  support,
  businessName,
  access,
  isSuperAdmin,
  canPayOnline,
  unverifiedEmail,
}: {
  support: boolean;
  businessName: string;
  access: SessionBusiness["access"];
  isSuperAdmin: boolean;
  canPayOnline: boolean;
  /** Correo aún sin confirmar (null si ya está confirmado) */
  unverifiedEmail: string | null;
}) {
  const tr = useText();
  const router = useRouter();
  const warning = access.blocked ? null : access.warning;
  return (
    <>
      {(support || isSuperAdmin) && (
        <div role="status" className="bg-purple-50 text-purple-800 text-sm font-medium px-4 py-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            {support
              ? tr("Modo soporte en {name}: tus cambios quedan en la bitácora.", { name: businessName })
              : tr("Eres administrador de la plataforma.")}
          </span>
          <span className="flex gap-3">
            {support && (
              <button
                onClick={async () => {
                  await fetch("/api/admin/exit", { method: "POST" });
                  router.push("/admin");
                  router.refresh();
                }}
                className="font-medium underline"
              >
                {tr("Salir del modo soporte")}
              </button>
            )}
            <Link href="/admin" className="font-medium underline">
              {tr("Panel de administración")}
            </Link>
          </span>
        </div>
      )}
      {warning?.kind === "trial" && (
        <div role="status" className="bg-blue-50 text-blue-800 text-sm font-medium px-4 py-2.5">
          {tr("Tu periodo de prueba termina en {days} día(s). Contacta al administrador para activar tu plan.", {
            days: warning.daysLeft,
          })}
          {canPayOnline && (
            <>
              {" "}
              <Link href="/configuracion/plan" className="font-medium underline">
                {tr("Pagar mi plan")}
              </Link>
            </>
          )}
        </div>
      )}
      {unverifiedEmail && <VerifyEmailNotice email={unverifiedEmail} />}
      {warning?.kind === "overdue" && (
        <div role="status" className="bg-mango-50 text-mango-800 text-sm font-medium px-4 py-2.5">
          {tr("El pago de tu plan está pendiente. Contacta al administrador para evitar la suspensión.")}
          {canPayOnline && (
            <>
              {" "}
              <Link href="/configuracion/plan" className="font-medium underline">
                {tr("Pagar mi plan")}
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Aviso para confirmar el correo, con reenvío del enlace. */
function VerifyEmailNotice({ email }: { email: string }) {
  const tr = useText();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  async function resend() {
    setSending(true);
    try {
      await api("/api/auth/verify-email/resend", { method: "POST" });
      toast.success(tr("Te enviamos un nuevo enlace. Revisa tu correo."));
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }
  return (
    <div role="status" className="bg-blue-50 text-blue-800 text-sm font-medium px-4 py-2.5">
      {tr("Confirma tu correo {email} con el enlace que te enviamos: así podrás recuperar tu contraseña.", { email })}{" "}
      <button type="button" onClick={resend} disabled={sending} className="font-medium underline disabled:opacity-60">
        {sending ? tr("Enviando…") : tr("Reenviar enlace")}
      </button>
    </div>
  );
}
