/* Service worker de ComercioClaro: permite abrir la app y vender sin conexión. */
// Subir la versión borra las cachés anteriores (páginas, datos, íconos) en todos los equipos.
const VERSION = "v3";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;
const PRECACHE = ["/offline", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

// Datos que el punto de venta necesita sin conexión (red primero, caché de respaldo).
const OFFLINE_API = ["/api/products", "/api/customers", "/api/auth/me", "/api/cash", "/api/categories", "/api/promotions"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  // Al cerrar sesión se borran las páginas y datos guardados de ese usuario.
  if (event.data === "clear-user-data") {
    event.waitUntil(Promise.all([caches.delete(PAGES_CACHE), caches.delete(DATA_CACHE)]));
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: "Sin conexión" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Guarda y responde desde la caché, pero actualiza la copia en segundo plano (íconos). */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // En producción los archivos de /_next/static/ llevan el contenido en el nombre: no cambian nunca.
  // (En desarrollo el service worker no se registra y el que haya quedado se da de baja.)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES_CACHE, "/offline"));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (OFFLINE_API.some((p) => url.pathname === p)) {
      event.respondWith(networkFirst(request, DATA_CACHE));
    }
    return;
  }
});
