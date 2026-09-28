"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { fetcher, withQuery } from "./api";

export function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Lista paginada por cursor ("cargar más"). */
export function usePaginated<T>(path: string, params: Record<string, string | number | boolean | null | undefined> = {}) {
  const swr = useSWRInfinite<Page<T>>(
    (index, previous) => {
      if (previous && !previous.nextCursor) return null;
      return withQuery(path, { ...params, cursor: index === 0 ? undefined : previous?.nextCursor });
    },
    fetcher,
    { revalidateFirstPage: true }
  );
  const pages = swr.data ?? [];
  const items = pages.flatMap((p) => p.items);
  const hasMore = pages.length > 0 && pages[pages.length - 1].nextCursor !== null;
  return {
    ...swr,
    items,
    hasMore,
    loadingMore: swr.isValidating && swr.size > pages.length,
    loadMore: () => swr.setSize(swr.size + 1),
  };
}

/**
 * Vuelve a pedir todas las listas paginadas de una ruta, con cualquier filtro (p. ej. activos y
 * archivados): sin esto, la lista con otro filtro se queda con la copia de antes del cambio.
 * (El filtro de mutate() de SWR no incluye las listas paginadas; por eso se recorre la caché).
 */
export function useRevalidateAll(path: string) {
  const { cache, mutate } = useSWRConfig();
  return () => {
    for (const key of cache.keys()) {
      if (key.startsWith(`$inf$${path}`)) mutate(key);
    }
  };
}
