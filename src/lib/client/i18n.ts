"use client";

import { useCallback, useContext } from "react";
import { SessionContext, useSession } from "@/components/providers/SessionProvider";
import { translate, type MessageKey } from "@/lib/i18n";
import { translateText } from "@/lib/i18n-text";

/** Traductor con el idioma elegido por el usuario. */
export function useT() {
  const { user } = useSession();
  return (key: MessageKey, params?: Record<string, string | number>) => translate(user.language, key, params);
}

/**
 * Traductor de textos de pantalla: `tr("Guardar")` devuelve el texto en el idioma del usuario.
 * Fuera de una sesión (inicio de sesión, registro) se queda en español.
 */
export function useText() {
  const language = useContext(SessionContext)?.user.language ?? "es";
  return useCallback(
    (text: string, params?: Record<string, string | number>) => translateText(language, text, params),
    [language]
  );
}
