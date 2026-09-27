import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-brand-50 rounded-3xl flex items-center justify-center mb-4 animate-in" aria-hidden="true">
        <Icon className="w-8 h-8 text-brand-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 max-w-xs mb-4">{description}</p>
      {action}
    </div>
  );
}
