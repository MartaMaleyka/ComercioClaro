import { useText } from "@/lib/client/i18n";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">{title}</h1>
        {description && <p className="text-sm md:text-base text-slate-500 mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/**
 * Contenedor con desplazamiento horizontal para tablas anchas: se puede enfocar con el teclado
 * para desplazarlo con las flechas (WCAG 2.1.1).
 */
export function ScrollArea({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200/70 rounded-2xl", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const tr = useText();
  return (
    <div className="space-y-3" aria-busy="true" aria-label={tr("Cargando")}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const tr = useText();
  return (
    <div
      role="alert"
      className="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3"
    >
      <span>{error instanceof Error ? error.message : tr("No se pudo cargar la información")}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          {tr("Reintentar")}
        </button>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  hero,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: React.ReactNode;
  /** Indicador principal de la pantalla: fondo Canal y cifra en blanco. */
  hero?: boolean;
}) {
  if (hero)
    return (
      <div className="relative overflow-hidden bg-brand-600 text-white rounded-2xl shadow-md p-4 md:p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg [&_a]:text-white">
        <span
          className="absolute -right-8 -top-10 w-32 h-32 rounded-full bg-white/10"
          aria-hidden="true"
        />
        <div className="relative flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white/90">{label}</p>
          {icon}
        </div>
        <p className="relative text-2xl md:text-[28px] leading-tight font-extrabold tracking-tight mt-1 tabular-nums">
          {value}
        </p>
        {hint && <p className="relative text-xs md:text-sm font-medium text-white/90 mt-1">{hint}</p>}
      </div>
    );
  return (
    <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {icon}
      </div>
      <p
        className={cn(
          "text-2xl md:text-[28px] leading-tight font-extrabold tracking-tight mt-1 tabular-nums",
          tone === "positive" && "text-brand-600",
          tone === "negative" && "text-red-600",
          tone === "warning" && "text-amber-600",
          tone === "default" && "text-slate-900"
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading?: boolean; onClick: () => void }) {
  const tr = useText();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline disabled:opacity-50"
      >
        {loading ? tr("Cargando...") : tr("Cargar más")}
      </button>
    </div>
  );
}
