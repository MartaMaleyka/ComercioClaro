"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Si se indica, pide un texto (p. ej. motivo) y lo devuelve al confirmar. */
  inputLabel?: string;
  inputRequired?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<string | boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<(v: string | boolean) => void>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setValue("");
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(result: string | boolean) {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  }

  const needsInput = Boolean(options?.inputLabel);
  const disabled = needsInput && options?.inputRequired !== false && value.trim().length < 3;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={options !== null} onClose={() => close(false)} title={options?.title ?? ""}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) close(needsInput ? value.trim() : true);
          }}
        >
          {options?.message && <p className="text-sm text-slate-600">{options.message}</p>}
          {needsInput && (
            <Input label={options!.inputLabel} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant={options?.danger ? "danger" : "primary"} disabled={disabled}>
              {options?.confirmLabel ?? "Confirmar"}
            </Button>
          </div>
        </form>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return ctx;
}
