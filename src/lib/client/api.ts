"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Error de red (sin conexión o servidor inaccesible). */
export function isNetworkError(err: unknown) {
  return err instanceof TypeError || (err instanceof ApiError && err.status === 0);
}

export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const init: RequestInit = { method: options.method ?? (options.body !== undefined ? "POST" : "GET"), signal: options.signal };
  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      // Recarga completa a propósito: descarta el estado de la sesión vencida.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiError(res.status, data?.error ?? "Ocurrió un error, intenta de nuevo");
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

/** Construye una URL con parámetros de búsqueda omitiendo vacíos. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
