import { useId } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full px-4 py-2.5 bg-surface border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors disabled:opacity-60";

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

function FieldWrapper({
  id,
  label,
  error,
  hint,
  children,
}: FieldProps & { id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldProps;

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const generated = useId();
  const inputId = id || generated;
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        className={cn(fieldClass, error && "border-red-400 focus:ring-red-500/30 focus:border-red-500", className)}
        {...props}
      />
    </FieldWrapper>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps;

export function Select({ label, error, hint, className, id, children, ...props }: SelectProps) {
  const generated = useId();
  const selectId = id || generated;
  return (
    <FieldWrapper id={selectId} label={label} error={error} hint={hint}>
      <select id={selectId} className={cn(fieldClass, "pr-8", className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;

export function Textarea({ label, error, hint, className, id, ...props }: TextareaProps) {
  const generated = useId();
  const textareaId = id || generated;
  return (
    <FieldWrapper id={textareaId} label={label} error={error} hint={hint}>
      <textarea id={textareaId} className={cn(fieldClass, "resize-none", className)} {...props} />
    </FieldWrapper>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-slate-700 cursor-pointer", className)}>
      <input type="checkbox" className="w-4 h-4 rounded accent-brand-600" {...props} />
      {label}
    </label>
  );
}
