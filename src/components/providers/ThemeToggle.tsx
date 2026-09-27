"use client";

import { useText } from "@/lib/client/i18n";
import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

/** Color de la barra del navegador en el celular, según el tema que se ve. */
const THEME_COLOR = { light: "#0e7a4e", dark: "#0e1512" };

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    // Con un tema elegido a mano, las dos etiquetas (claro/oscuro del sistema) muestran el mismo color.
    meta.content = theme === "system" ? (meta.media.includes("dark") ? THEME_COLOR.dark : THEME_COLOR.light) : THEME_COLOR[dark ? "dark" : "light"];
  }
}

/**
 * Cambia el tema con un fundido suave (View Transitions cuando el navegador lo tiene).
 * Con "reducir movimiento" el cambio es inmediato.
 */
function applyAnimated(theme: Theme) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!reduce && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => apply(theme));
  } else {
    apply(theme);
  }
}

/** Script que se ejecuta antes de pintar para evitar el parpadeo del tema. */
export const themeScript = `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

const THEME_EVENT = "theme-change";

function readTheme(): Theme {
  try {
    return (localStorage.getItem("theme") as Theme) || "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
    mq.removeEventListener("change", callback);
  };
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem("theme", theme);
  } catch {}
  applyAnimated(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Tema elegido y si lo que se ve ahora es oscuro. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => theme === "dark" || (theme === "system" && prefersDark()),
    () => false
  );

  // Siguiendo al sistema, el tema cambia solo cuando el sistema cambia.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAnimated("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, dark, setTheme };
}

/** Selector completo: Claro, Oscuro o Sistema. */
export function ThemeToggle({ className }: { className?: string }) {
  const tr = useText();
  const { theme } = useTheme();

  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Monitor },
  ];

  return (
    <div role="radiogroup" aria-label={tr("Tema")} className={cn("inline-flex rounded-2xl bg-slate-100 p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "press flex flex-1 items-center justify-center gap-1.5 px-3 min-h-10 rounded-xl text-sm font-semibold",
            theme === o.value ? "bg-brand-600 text-white shadow-sm" : "text-slate-700 hover:bg-surface/70"
          )}
        >
          <o.icon className="w-4 h-4" aria-hidden="true" />
          {tr(o.label)}
        </button>
      ))}
    </div>
  );
}

/** Botón de un toque que alterna entre claro y oscuro (según lo que se ve ahora). */
export function ThemeSwitch({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const tr = useText();
  const { dark } = useTheme();
  const label = dark ? tr("Cambiar a modo claro") : tr("Cambiar a modo oscuro");
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={withLabel ? undefined : label}
      title={label}
      className={cn("press", className)}
    >
      <Icon key={dark ? "sun" : "moon"} className="w-5 h-5 shrink-0 animate-[pop_360ms_cubic-bezier(.2,.8,.2,1)]" aria-hidden="true" />
      {withLabel && (dark ? tr("Modo claro") : tr("Modo oscuro"))}
    </button>
  );
}
