import { cn } from "@/lib/utils";

const tones = {
  gray: { box: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  green: { box: "bg-brand-50 text-brand-700 dark:text-brand-300", dot: "bg-brand-600" },
  red: { box: "bg-red-50 text-red-700", dot: "bg-red-600" },
  amber: { box: "bg-mango-50 text-mango-800", dot: "bg-mango-400" },
  blue: { box: "bg-blue-50 text-blue-700", dot: "bg-blue-600" },
  purple: { box: "bg-purple-50 text-purple-700", dot: "bg-purple-600" },
};

/** Insignia de estado. Con `dot`, el estado se lee por el punto y la palabra, nunca solo por el color. */
export function Badge({
  children,
  tone = "gray",
  dot,
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
        tones[tone].box,
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", tones[tone].dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}
