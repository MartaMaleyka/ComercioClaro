import crypto from "crypto";
import type { PanamaDocument } from "./document";

export type PacStatus = "AUTHORIZED" | "PENDING" | "REJECTED";

export interface PacResult {
  status: PacStatus;
  providerId?: string | null;
  cufe?: string | null;
  qrUrl?: string | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  message?: string | null;
}

/** Error temporal (sin red, PAC o DGI caídos): la factura se reintenta más tarde. */
export class PacUnavailableError extends Error {}

export interface PacProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  issue(document: PanamaDocument, idempotencyKey: string): Promise<PacResult>;
  status(providerId: string): Promise<PacResult>;
  cancel(providerId: string, cufe: string, reason: string): Promise<void>;
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new PacUnavailableError(err instanceof Error ? err.message : "Sin conexión con el PAC");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text.slice(0, 300) };
  }
  if (res.status >= 500 || res.status === 429) {
    throw new PacUnavailableError(`El PAC respondió ${res.status}`);
  }
  if (!res.ok) {
    const b = body as { message?: string; error?: string; errors?: unknown } | null;
    throw new Error(b?.message || b?.error || (b?.errors ? JSON.stringify(b.errors) : `Error ${res.status}`));
  }
  return body;
}

type AlanubeResponse = {
  id?: string;
  cufe?: string;
  authorizationCode?: string;
  status?: string;
  dgiStatus?: string;
  qr?: string;
  qrUrl?: string;
  legalStatus?: string;
  assetUrls?: { pdf?: string; xml?: string; qr?: string };
  documentInfo?: { cufe?: string; qr?: string };
  message?: string;
};

function mapAlanube(body: AlanubeResponse): PacResult {
  const raw = (body.dgiStatus ?? body.legalStatus ?? body.status ?? "").toUpperCase();
  const status: PacStatus = ["ACCEPTED", "AUTHORIZED", "AUTORIZADO", "APPROVED"].includes(raw)
    ? "AUTHORIZED"
    : ["REJECTED", "RECHAZADO", "ERROR"].includes(raw)
      ? "REJECTED"
      : "PENDING";
  return {
    status,
    providerId: body.id ?? null,
    cufe: body.cufe ?? body.documentInfo?.cufe ?? body.authorizationCode ?? null,
    qrUrl: body.qrUrl ?? body.qr ?? body.assetUrls?.qr ?? body.documentInfo?.qr ?? null,
    pdfUrl: body.assetUrls?.pdf ?? null,
    xmlUrl: body.assetUrls?.xml ?? null,
    message: body.message ?? null,
  };
}

/**
 * Alanube (PAC autorizado por la DGI). API REST con token Bearer; el sandbox es gratuito
 * al solicitarlo a Alanube. Nombres de campos según su guía pública para Panamá;
 * verificar contra https://developer.alanube.co/v1.0-PAN antes de producción.
 */
export const alanube: PacProvider = {
  id: "alanube",
  name: "Alanube",
  isConfigured: () => Boolean(process.env.ALANUBE_API_URL && process.env.ALANUBE_TOKEN),
  async issue(doc, idempotencyKey) {
    const body = {
      documentType: doc.documentType,
      documentNumber: doc.number,
      date: doc.issueDate,
      currency: "PAB",
      issuer: { ruc: doc.issuer.ruc, dv: doc.issuer.dv, name: doc.issuer.name, branchCode: doc.issuer.branch },
      receiver: {
        type: doc.receiver.type,
        ruc: doc.receiver.ruc,
        dv: doc.receiver.dv,
        name: doc.receiver.name,
        email: doc.receiver.email ?? undefined,
      },
      items: doc.items.map((i) => ({
        code: i.code,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate,
        taxCode: i.taxCode,
        itbms: i.itbms,
        total: i.total,
      })),
      totals: doc.totals,
      payments: doc.payments,
    };
    const res = (await request(`${process.env.ALANUBE_API_URL}/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ALANUBE_TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    })) as AlanubeResponse;
    return mapAlanube(res);
  },
  async status(providerId) {
    const res = (await request(`${process.env.ALANUBE_API_URL}/invoices/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${process.env.ALANUBE_TOKEN}` },
    })) as AlanubeResponse;
    return mapAlanube(res);
  },
  async cancel(providerId, _cufe, reason) {
    await request(`${process.env.ALANUBE_API_URL}/invoices/${encodeURIComponent(providerId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.ALANUBE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  },
};

/**
 * PAC simulado para pruebas y demostraciones: autoriza al instante y genera un CUFE
 * de prueba (no válido ante la DGI). Con PAC_SIMULATE_OUTAGE=true simula que el PAC está caído.
 */
export const simulatedPac: PacProvider = {
  id: "simulado",
  name: "Simulador (pruebas, sin validez fiscal)",
  isConfigured: () => true,
  async issue(doc, idempotencyKey) {
    if (process.env.PAC_SIMULATE_OUTAGE === "true") throw new PacUnavailableError("PAC simulado fuera de servicio");
    const hash = crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 20).toUpperCase();
    const cufe = `PRUEBA-FE${doc.documentType}-${doc.issuer.ruc}-${doc.number}-${hash}`;
    return { status: "AUTHORIZED", providerId: `sim_${hash}`, cufe, qrUrl: null, message: "Documento de prueba" };
  },
  async status(providerId) {
    return { status: "AUTHORIZED", providerId };
  },
  async cancel() {},
};

export const PAC_PROVIDERS: Record<string, PacProvider> = {
  [alanube.id]: alanube,
  [simulatedPac.id]: simulatedPac,
};

export function getPacProvider(id: string | null | undefined): PacProvider | null {
  return id ? (PAC_PROVIDERS[id] ?? null) : null;
}
