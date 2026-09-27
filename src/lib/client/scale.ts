"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { parseScaleReading, type WeightUnit } from "@/lib/scale";

/**
 * Balanza conectada por puerto serie (USB o RS-232 con adaptador) usando Web Serial,
 * disponible en Chrome y Edge de escritorio. La configuración se guarda en este equipo,
 * porque la balanza está conectada a esta computadora.
 */

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export interface ScaleConfig {
  baudRate: number;
  /** request: se pide el peso enviando "W" (Toledo 8217, CAS y la mayoría); continuous: la balanza lo envía sola */
  protocol: "request" | "continuous";
}

const STORAGE_KEY = "comercioclaro:scale";
const DEFAULT_CONFIG: ScaleConfig = { baudRate: 9600, protocol: "request" };

function serial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null;
}

export const scaleSupported = () => serial() !== null;

export function loadScaleConfig(): ScaleConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ScaleConfig>) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveScaleConfig(config: ScaleConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Sin almacenamiento local (modo privado): la configuración dura esta sesión.
  }
}

let port: SerialPortLike | null = null;
let openedWith: number | null = null;

async function openPort(p: SerialPortLike, baudRate: number) {
  if (port === p && openedWith === baudRate) return p;
  if (port) await port.close().catch(() => undefined);
  await p.open({ baudRate });
  port = p;
  openedWith = baudRate;
  return p;
}

/** Pide al usuario elegir el puerto de la balanza (requiere un clic). */
export async function connectScale(config: ScaleConfig) {
  const s = serial();
  if (!s) throw new Error("Este navegador no permite conectar la balanza. Usa Chrome o Edge en una computadora.");
  return openPort(await s.requestPort(), config.baudRate);
}

/** Vuelve a abrir la balanza autorizada antes, sin preguntar. */
async function reconnect(config: ScaleConfig) {
  const s = serial();
  if (!s) return null;
  if (port) return openPort(port, config.baudRate);
  const [known] = await s.getPorts();
  return known ? openPort(known, config.baudRate) : null;
}

/** Lee un peso estable de la balanza (espera hasta 3 segundos). */
export async function readWeight(config: ScaleConfig): Promise<{ weight: number; unit: WeightUnit | null }> {
  const p = await reconnect(config);
  if (!p?.readable) throw new Error("Conecta la balanza en Configuración");
  if (config.protocol === "request" && p.writable) {
    const writer = p.writable.getWriter();
    await writer.write(new TextEncoder().encode("W\r\n"));
    writer.releaseLock();
  }
  const reader = p.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const timeout = setTimeout(() => reader.cancel().catch(() => undefined), 3000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/[\r\n\x03]+/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const reading = parseScaleReading(line);
        if (reading && reading.stable && reading.weight > 0) return { weight: reading.weight, unit: reading.unit };
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  throw new Error("La balanza no envió un peso estable. Revisa que el producto esté quieto sobre el plato.");
}

const listeners = new Set<() => void>();
const noopSubscribe = () => () => undefined;
let cachedConfig: ScaleConfig | null = null;
let connectedFlag = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

const configSnapshot = () => (cachedConfig ??= loadScaleConfig());
const connectedSnapshot = () => connectedFlag;

/** Estado de la balanza para las pantallas. */
export function useScale() {
  const supported = useSyncExternalStore(noopSubscribe, scaleSupported, () => false);
  const config = useSyncExternalStore(subscribe, configSnapshot, () => DEFAULT_CONFIG);
  const connected = useSyncExternalStore(subscribe, connectedSnapshot, () => false);

  useEffect(() => {
    serial()
      ?.getPorts()
      .then((ports) => {
        connectedFlag = ports.length > 0;
        notify();
      })
      .catch(() => undefined);
  }, []);

  const update = useCallback((next: ScaleConfig) => {
    cachedConfig = next;
    saveScaleConfig(next);
    notify();
  }, []);

  const connect = useCallback(async () => {
    await connectScale(config);
    connectedFlag = true;
    notify();
  }, [config]);

  const read = useCallback(() => readWeight(config), [config]);

  return { supported, connected, config, update, connect, read };
}
