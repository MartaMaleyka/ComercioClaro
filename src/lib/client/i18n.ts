"use client";

import { useSession } from "@/components/providers/SessionProvider";
import { translate, type MessageKey } from "@/lib/i18n";

/** Traductor con el idioma elegido por el usuario. */
export function useT() {
  const { user } = useSession();
  return (key: MessageKey, params?: Record<string, string | number>) => translate(user.language, key, params);
}
