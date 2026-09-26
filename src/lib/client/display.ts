"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { DISPLAY_CHANNEL, DISPLAY_REMOTE_KEY, type DisplayState } from "@/lib/display";

const REMOTE_EVENT = "cc-display-remote-change";

function readRemote() {
  try {
    return localStorage.getItem(DISPLAY_REMOTE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeRemote(callback: () => void) {
  window.addEventListener(REMOTE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(REMOTE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Preferencia del equipo: enviar también la pantalla del cliente a otra pantalla o tableta. */
export function useDisplayRemote() {
  const remote = useSyncExternalStore(subscribeRemote, readRemote, () => false);
  const setRemote = (value: boolean) => {
    try {
      localStorage.setItem(DISPLAY_REMOTE_KEY, value ? "1" : "0");
    } catch {
      // Sin almacenamiento local la preferencia dura solo mientras la página está abierta.
    }
    window.dispatchEvent(new Event(REMOTE_EVENT));
  };
  return [remote, setRemote] as const;
}

/**
 * Publica lo que ve el cliente: al instante en el mismo equipo (BroadcastChannel)
 * y, si se activó, al servidor para una pantalla en otro equipo.
 */
export function usePublishDisplay(state: Omit<DisplayState, "at">) {
  const [remote] = useDisplayRemote();
  const channel = useRef<BroadcastChannel | null>(null);
  const serialized = JSON.stringify(state);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    channel.current = new BroadcastChannel(DISPLAY_CHANNEL);
    return () => channel.current?.close();
  }, []);

  useEffect(() => {
    const payload: DisplayState = { ...(JSON.parse(serialized) as Omit<DisplayState, "at">), at: Date.now() };
    channel.current?.postMessage(payload);
    if (!remote) return;
    const timer = setTimeout(() => {
      fetch("/api/display", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Sin conexión: la pantalla remota se actualiza con el siguiente cambio.
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [serialized, remote]);
}
