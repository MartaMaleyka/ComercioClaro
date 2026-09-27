import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "accent";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
}

/** Botón del Sistema Claro: alto táctil (48 px en md), se hunde al presionar y no salta al cargar. */
export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-surface text-slate-900 border-[1.5px] border-slate-300 hover:border-slate-900 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
    ghost: "text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:hover:text-brand-300",
    accent: "bg-mango-400 text-ink hover:bg-mango-500 shadow-sm",
  };

  const sizes = {
    sm: "px-3 min-h-9 text-sm rounded-lg",
    md: "px-4 min-h-12 text-[15px] rounded-xl",
    lg: "px-6 min-h-14 text-base rounded-2xl",
    xl: "px-6 min-h-16 text-lg rounded-2xl",
  };

  return (
    <button
      className={cn(
        "press inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
