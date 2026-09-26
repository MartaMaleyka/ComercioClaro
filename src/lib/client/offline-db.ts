"use client";

/**
 * Almacenamiento local (IndexedDB) para vender sin conexión:
 * - kv: copia del catálogo y clientes para el punto de venta.
 * - pending: ventas por enviar (clave: clientRequestId, así el servidor no las duplica).
 * - failed: ventas que el servidor rechazó al sincronizar (p. ej. sin existencias).
 */

const DB_NAME = "comercioclaro";
const DB_VERSION = 1;
export const QUEUE_EVENT = "offline-queue-changed";

export interface PendingSale {
  clientRequestId: string;
  businessId: string;
  payload: Record<string, unknown>;
  total: number;
  createdAt: string;
  error?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("pending")) db.createObjectStore("pending", { keyPath: "clientRequestId" });
      if (!db.objectStoreNames.contains("failed")) db.createObjectStore("failed", { keyPath: "clientRequestId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function notify() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export const kvGet = <T,>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key));

export async function queueSale(sale: PendingSale) {
  await run("pending", "readwrite", (s) => s.put(sale));
  notify();
}

export const listPending = () => run<PendingSale[]>("pending", "readonly", (s) => s.getAll());
export const listFailed = () => run<PendingSale[]>("failed", "readonly", (s) => s.getAll());

export async function removePending(id: string) {
  await run("pending", "readwrite", (s) => s.delete(id));
  notify();
}

export async function moveToFailed(sale: PendingSale, error: string) {
  await run("failed", "readwrite", (s) => s.put({ ...sale, error }));
  await run("pending", "readwrite", (s) => s.delete(sale.clientRequestId));
  notify();
}

export async function removeFailed(id: string) {
  await run("failed", "readwrite", (s) => s.delete(id));
  notify();
}

export async function clearOfflineData() {
  try {
    await Promise.all([
      run("kv", "readwrite", (s) => s.clear()),
      run("pending", "readwrite", (s) => s.clear()),
      run("failed", "readwrite", (s) => s.clear()),
    ]);
  } catch {
    // Sin IndexedDB disponible: nada que limpiar.
  }
}
