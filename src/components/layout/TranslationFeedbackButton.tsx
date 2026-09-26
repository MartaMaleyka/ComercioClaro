"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** Botón para que el usuario reporte un texto mal traducido en la pantalla actual. */
export function TranslationFeedbackButton({ className }: { className?: string }) {
  const tr = useText();
  const { user } = useSession();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [saving, setSaving] = useState(false);

  if (user.language === "es") return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/translations/feedback", { body: { screen: pathname, original, suggestion } });
      toast.success(tr("Gracias, revisaremos la traducción"));
      setOpen(false);
      setOriginal("");
      setSuggestion("");
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        <Languages className="w-5 h-5" aria-hidden="true" />
        {tr("Reportar traducción")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={tr("Reportar traducción")}>
        <form onSubmit={send} className="space-y-3">
          <p className="text-sm text-slate-600">
            {tr("Copia el texto que no se entiende y escribe cómo lo dirías tú. Se guarda con esta pantalla.")}
          </p>
          <Input
            label={tr("Texto en pantalla")}
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            required
            maxLength={500}
          />
          <Textarea
            label={tr("Cómo debería decir")}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            required
            maxLength={500}
            rows={3}
          />
          <Button type="submit" loading={saving} className="w-full">
            {tr("Enviar")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
