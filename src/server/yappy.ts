import crypto from "crypto";
import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { YappyChargeStatus } from "@/generated/prisma/enums";
import type { Actor } from "./inventory";

/**
 * Cobro de Yappy con confirmación automática desde el punto de venta.
 *
 * El cajero escribe el número Yappy del cliente; la pasarela le envía la solicitud
 * de pago a su app y el sistema registra la venta cuando el pago se confirma.
 */

export interface YappyGateway {
  id: string;
  isConfigured(): boolean;
  createCharge(input: { orderId: string; amount: number; phone: string; description: string }): Promise<{
    providerTxId: string | null;
  }>;
  /** Consulta el estado cuando la pasarela no avisa por IPN (simulador). */
  poll?(charge: { orderId: string; createdAt: Date; phone: string | null }): Promise<YappyChargeStatus>;
}

/**
 * Banco General — API del Botón de Pago Yappy (integración nueva por API, 2025).
 * Flujo: validar comercio (token) → crear orden con el número Yappy del cliente →
 * Yappy notifica el resultado a la URL IPN. Endpoints y campos según la documentación
 * para desarrolladores de Yappy Comercial; confirmar con Banco General antes de producción.
 */
export const bancoGeneral: YappyGateway = {
  id: "bg",
  isConfigured: () =>
    Boolean(process.env.YAPPY_MERCHANT_ID && process.env.YAPPY_SECRET_KEY && process.env.YAPPY_DOMAIN),
  async createCharge({ orderId, amount, phone }) {
    const base = (process.env.YAPPY_API_URL || "https://apipagosbg.bgeneral.cloud").replace(/\/$/, "");
    const merchantId = process.env.YAPPY_MERCHANT_ID!;
    const domain = process.env.YAPPY_DOMAIN!;

    const post = async (path: string, body: unknown, token?: string) => {
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token && { Authorization: token }) },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new AppError(503, "No hay conexión con Yappy. Cobra con el QR del comercio.");
      }
      const json = (await res.json().catch(() => null)) as {
        status?: { code?: string; description?: string };
        body?: Record<string, unknown>;
      } | null;
      if (!res.ok || !json?.body) {
        throw new AppError(502, `Yappy rechazó la solicitud: ${json?.status?.description ?? res.status}`);
      }
      return json.body;
    };

    const session = await post("/v1/session/device", { merchantId, urlDomain: domain });
    const total = money(amount).toFixed(2);
    const order = await post(
      "/v1/payments/payment-wc",
      {
        merchantId,
        orderId,
        domain,
        paymentDate: Math.floor(Date.now() / 1000),
        aliasYappy: phone,
        ipnUrl: `${getAppUrl()}/api/yappy/ipn`,
        discount: "0.00",
        taxes: "0.00",
        subtotal: total,
        total,
      },
      String(session.token ?? "")
    );
    return { providerTxId: (order.transactionId as string | undefined) ?? null };
  },
};

/**
 * Simulador para demostraciones y pruebas: el pago se confirma 5 segundos después
 * (números que terminan en 0000 son rechazados).
 */
export const simulatedYappy: YappyGateway = {
  id: "simulado",
  isConfigured: () => true,
  async createCharge({ orderId }) {
    return { providerTxId: `SIM-${orderId.slice(-8).toUpperCase()}` };
  },
  async poll({ createdAt, phone }) {
    if (phone?.endsWith("0000")) return "FAILED";
    const delay = Number(process.env.YAPPY_SIMULATED_DELAY_MS ?? 5000);
    return Date.now() - createdAt.getTime() >= delay ? "PAID" : "PENDING";
  },
};

export function yappyGateway(): YappyGateway {
  if (process.env.YAPPY_PROVIDER === "bg") return bancoGeneral;
  return simulatedYappy;
}

const EXPIRY_MS = 5 * 60 * 1000;

export async function createYappyCharge(actor: Actor, input: { amount: number; phone: string }) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
  if (business.yappyMode !== "API") throw new AppError(409, "El cobro automático de Yappy no está activo");
  const gateway = yappyGateway();
  if (!gateway.isConfigured()) throw new AppError(503, "Faltan las credenciales de Yappy Comercial en el servidor");

  const phone = input.phone.replace(/\D/g, "");
  if (!/^6\d{7}$/.test(phone)) throw new AppError(400, "Escribe el celular Yappy del cliente (8 dígitos, empieza con 6)");

  const orderId = `CC${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const charge = await prisma.yappyCharge.create({
    data: {
      orderId,
      amount: money(input.amount),
      phone,
      provider: gateway.id,
      businessId: actor.businessId,
      userId: actor.userId,
    },
  });
  try {
    const { providerTxId } = await gateway.createCharge({
      orderId,
      amount: input.amount,
      phone,
      description: business.name,
    });
    return prisma.yappyCharge.update({ where: { id: charge.id }, data: { providerTxId } });
  } catch (err) {
    await prisma.yappyCharge.update({
      where: { id: charge.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Error" },
    });
    throw err;
  }
}

/** Estado actual del cobro (el punto de venta lo consulta cada pocos segundos). */
export async function getYappyCharge(businessId: string, id: string) {
  let charge = await prisma.yappyCharge.findFirst({ where: { id, businessId } });
  if (!charge) throw notFound("Cobro");
  if (charge.status === "PENDING") {
    const gateway = yappyGateway();
    let status: YappyChargeStatus = charge.status;
    if (gateway.id === charge.provider && gateway.poll) status = await gateway.poll(charge);
    if (status === "PENDING" && Date.now() - charge.createdAt.getTime() > EXPIRY_MS) status = "EXPIRED";
    if (status !== "PENDING") {
      charge = await prisma.yappyCharge.update({
        where: { id: charge.id },
        data: { status, paidAt: status === "PAID" ? new Date() : null },
      });
    }
  }
  return charge;
}

export async function cancelYappyCharge(businessId: string, id: string) {
  const { count } = await prisma.yappyCharge.updateMany({
    where: { id, businessId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (count === 0) throw new AppError(409, "El cobro ya no está pendiente");
}

const IPN_STATUS: Record<string, YappyChargeStatus> = { E: "PAID", R: "FAILED", C: "CANCELLED", X: "EXPIRED" };

/**
 * Valida la notificación (IPN) de Yappy: hash HMAC-SHA256 de orderId + status + domain
 * con la clave secreta del comercio.
 */
export function verifyYappyHash(params: { orderId: string; status: string; domain: string; hash: string }) {
  const secret = process.env.YAPPY_SECRET_KEY;
  if (!secret) return false;
  // La clave secreta de Yappy viene en base64 con el formato "clave.extra".
  let key = secret;
  try {
    key = Buffer.from(secret, "base64").toString("utf8").split(".")[0] || secret;
  } catch {}
  const expected = crypto.createHmac("sha256", key).update(params.orderId + params.status + params.domain).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(params.hash.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleYappyIpn(params: { orderId: string; status: string; domain: string; hash: string }) {
  if (!verifyYappyHash(params)) throw new AppError(401, "Firma inválida");
  const status = IPN_STATUS[params.status];
  if (!status) throw new AppError(400, "Estado desconocido");
  await prisma.yappyCharge.updateMany({
    where: { orderId: params.orderId, status: "PENDING" },
    data: { status, paidAt: status === "PAID" ? new Date() : null },
  });
}

/** Verifica que el cobro esté pagado, sea del monto de la venta y no esté usado. */
export async function assertChargeForSale(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  actor: Actor,
  chargeId: string,
  total: ReturnType<typeof D>
) {
  const charge = await tx.yappyCharge.findFirst({ where: { id: chargeId, businessId: actor.businessId } });
  if (!charge) throw notFound("Cobro de Yappy");
  if (charge.status !== "PAID") throw new AppError(409, "El pago de Yappy aún no está confirmado");
  if (charge.saleId) throw new AppError(409, "Ese pago de Yappy ya se usó en otra venta");
  if (D(charge.amount).minus(total).abs().gt(0.005)) {
    throw new AppError(409, "El monto pagado por Yappy no coincide con el total de la venta");
  }
  await audit(tx, actor, "yappy.charge.use", "YappyCharge", charge.id, { amount: charge.amount.toNumber() });
  return charge;
}
