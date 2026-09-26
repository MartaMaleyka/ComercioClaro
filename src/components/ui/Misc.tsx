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
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-100 rounded-xl", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>{error instanceof Error ? error.message : "No se pudo cargar la información"}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          Reintentar
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
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p
        className={cn(
          "text-xl font-bold mt-1 tabular-nums",
          tone === "positive" && "text-brand-600",
          tone === "negative" && "text-red-600",
          tone === "warning" && "text-amber-600",
          tone === "default" && "text-slate-900"
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading?: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline disabled:opacity-50"
      >
        {loading ? "Cargando..." : "Cargar más"}
      </button>
    </div>
  );
}
