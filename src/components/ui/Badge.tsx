import { cn } from "@/lib/utils";

const tones = {
  gray: "bg-slate-100 text-slate-600",
  green: "bg-brand-50 text-brand-700 dark:text-brand-300",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-purple-50 text-purple-700",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
