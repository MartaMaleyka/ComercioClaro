import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useText } from "@/lib/client/i18n";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full min-h-12 px-4 py-2.5 bg-surface border-[1.5px] border-slate-300 rounded-xl text-base text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-600/15 focus:border-brand-600 transition-[border-color,box-shadow] duration-150 disabled:opacity-60";

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
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
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
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-red-600">
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
        className={cn(fieldClass, error && "border-red-600 focus:ring-red-600/15 focus:border-red-600", className)}
        {...props}
      />
    </FieldWrapper>
  );
}

/**
 * Contraseña con botón para verla. El nombre del botón va en texto oculto (no en aria-label)
 * para que "Contraseña" siga identificando solo al campo.
 */
export function PasswordInput({ label, error, hint, className, id, ...props }: Omit<InputProps, "type">) {
  const tr = useText();
  const generated = useId();
  const inputId = id || generated;
  const [visible, setVisible] = useState(false);
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint} required={props.required}>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          className={cn(fieldClass, "pr-14", error && "border-red-600 focus:ring-red-600/15 focus:border-red-600", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={inputId}
          title={visible ? tr("Ocultar contraseña") : tr("Mostrar contraseña")}
          className="press absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {visible ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
          <span className="sr-only">{visible ? tr("Ocultar contraseña") : tr("Mostrar contraseña")}</span>
        </button>
      </div>
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
    <label className={cn("flex items-center gap-2.5 min-h-8 text-sm text-slate-700 cursor-pointer", className)}>
      <input type="checkbox" className="w-5 h-5 shrink-0 rounded accent-brand-600" {...props} />
      {label}
    </label>
  );
}
