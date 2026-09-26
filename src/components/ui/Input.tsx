import { useId } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full px-4 py-2.5 bg-surface border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-colors disabled:opacity-60";

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
}

/** Enlaza la ayuda y el error con el campo para que el lector de pantalla los lea (WCAG 1.3.1 / 3.3.1). */
function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

function FieldWrapper({
  id,
  label,
  error,
  hint,
  required,
  children,
}: FieldProps & { id: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="text-red-600 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
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
    <FieldWrapper id={inputId} label={label} error={error} hint={hint} required={props.required}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
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
    <FieldWrapper id={selectId} label={label} error={error} hint={hint} required={props.required}>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, error, hint)}
        className={cn(fieldClass, "pr-8", className)}
        {...props}
      >
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
    <FieldWrapper id={textareaId} label={label} error={error} hint={hint} required={props.required}>
      <textarea
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(textareaId, error, hint)}
        className={cn(fieldClass, "resize-none", className)}
        {...props}
      />
    </FieldWrapper>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 min-h-6 text-sm text-slate-700 cursor-pointer", className)}>
      <input type="checkbox" className="w-5 h-5 shrink-0 rounded accent-brand-600" {...props} />
      {label}
    </label>
  );
}
