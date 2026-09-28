"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // En desarrollo no debe quedar un service worker de una corrida de producción en el mismo
      // puerto: serviría JavaScript viejo desde su caché y React avisaría de un error de hidratación.
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => undefined);
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("No se pudo registrar el service worker", err);
    });
  }, []);
  return null;
}
