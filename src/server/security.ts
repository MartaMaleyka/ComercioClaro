import crypto from "crypto";
import QRCode from "qrcode";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getJwtSecret } from "@/lib/env";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { hashToken, startSession, verifyPassword, type SessionMeta } from "@/lib/auth";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  openSecret,
  otpauthUrl,
  sealSecret,
  verifyTotp,
} from "@/lib/totp";

/**
 * Seguridad de las cuentas: historial de inicios de sesión, aviso de dispositivo nuevo, sesiones
 * abiertas y verificación en dos pasos (TOTP con códigos de recuperación).
 */

const appSecret = () => Buffer.from(getJwtSecret()).toString("utf8");
type Mailer = typeof sendEmail;

// ---------- Historial ----------

export type LoginReason = "OK" | "BAD_PASSWORD" | "UNKNOWN_EMAIL" | "BLOCKED" | "MFA_REQUIRED" | "MFA_FAILED";

export async function recordLogin(event: {
  userId: string | null;
  email: string;
  success: boolean;
  reason: LoginReason;
  meta: SessionMeta;
}) {
  await prisma.loginEvent.create({
    data: {
      userId: event.userId,
      email: event.email,
      success: event.success,
      reason: event.reason,
      ip: event.meta.ip,
      userAgent: event.meta.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Motivo de un inicio de sesión fallido (para el historial; al usuario siempre se le dice lo mismo). */
export async function failureReason(email: string): Promise<{ userId: string | null; reason: LoginReason }> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, disabledAt: true } });
  if (!user) return { userId: null, reason: "UNKNOWN_EMAIL" };
  return { userId: user.id, reason: user.disabledAt ? "BLOCKED" : "BAD_PASSWORD" };
}

export async function loginHistory(userId: string, limit = 20) {
  return prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, success: true, reason: true, ip: true, userAgent: true, createdAt: true },
  });
}

/** Nombre corto del dispositivo: "Chrome en Windows". */
export function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Dispositivo desconocido";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Navegador";
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iOS/.test(userAgent)
      ? "iPhone o iPad"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "Mac"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "otro sistema";
  return `${browser} en ${os}`;
}

/**
 * Completa el inicio de sesión: abre la sesión del dispositivo, guarda el acceso y, si es un
 * dispositivo que no se había usado, avisa por correo.
 */
export async function finishLogin(
  user: { id: string; email: string; name: string; tokenVersion: number },
  businessId: string,
  meta: SessionMeta,
  mail: Mailer = sendEmail
) {
  const known = await prisma.loginEvent.findFirst({
    where: { userId: user.id, success: true, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    select: { id: true },
  });
  const firstLogin = (await prisma.loginEvent.count({ where: { userId: user.id, success: true } })) === 0;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession({ sub: user.id, bid: businessId, tv: user.tokenVersion }, meta);
  await recordLogin({ userId: user.id, email: user.email, success: true, reason: "OK", meta });
  if (!known && !firstLogin) {
    const device = describeDevice(meta.userAgent);
    const when = new Intl.DateTimeFormat("es", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Panama",
    }).format(new Date());
    const link = `${getAppUrl()}/seguridad`;
    await mail({
      to: user.email,
      subject: "Nuevo inicio de sesión en tu cuenta de ComercioClaro",
      text: `Hola ${user.name}:\n\nSe inició sesión en tu cuenta desde ${device} (IP ${meta.ip ?? "desconocida"}) el ${when}.\n\nSi fuiste tú, no tienes que hacer nada. Si no, cambia tu contraseña y cierra las demás sesiones en ${link}`,
      html: `<p>Hola ${escapeHtml(user.name)}:</p><p>Se inició sesión en tu cuenta desde <strong>${escapeHtml(device)}</strong> (IP ${escapeHtml(meta.ip ?? "desconocida")}) el ${escapeHtml(when)}.</p><p>Si fuiste tú, no tienes que hacer nada. Si no, <a href="${link}">cambia tu contraseña y cierra las demás sesiones</a>.</p>`,
    }).catch(() => false);
  }
}

// ---------- Sesiones abiertas ----------

export async function listSessions(userId: string, currentSid: string | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, tokenVersion: user.tokenVersion },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    device: describeDevice(s.userAgent),
    ip: s.ip,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    current: s.id === currentSid,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const { count } = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new AppError(404, "La sesión ya estaba cerrada");
  return { revoked: true };
}

/** Cierra todas las sesiones menos la de este dispositivo. */
export async function revokeOtherSessions(userId: string, currentSid: string | null) {
  const { count } = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, ...(currentSid ? { id: { not: currentSid } } : {}) },
    data: { revokedAt: new Date() },
  });
  return { revoked: count };
}

// ---------- Verificación en dos pasos ----------

export const MFA_COOKIE = "comercio-claro-mfa";
const MFA_TTL_SECONDS = 5 * 60;

/** ¿Tiene que usar la verificación en dos pasos? Super admin (salvo ADMIN_MFA_REQUIRED=false) o negocio que la exige. */
export async function mfaRequiredFor(user: { id: string; isSuperAdmin: boolean }) {
  if (user.isSuperAdmin && process.env.ADMIN_MFA_REQUIRED !== "false") return "admin" as const;
  const strict = await prisma.membership.findFirst({
    where: { userId: user.id, business: { requireMfa: true } },
    select: { business: { select: { name: true } } },
  });
  return strict ? ("business" as const) : null;
}

/** Empieza a configurar: genera una clave nueva (aún no activa) y su código QR. */
export async function beginMfaSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt) throw new AppError(400, "La verificación en dos pasos ya está activa");
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: sealSecret(secret, appSecret()) } });
  const url = otpauthUrl(secret, user.email);
  return { secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

function recoveryHash(code: string) {
  return hashToken(`recovery:${normalizeRecoveryCode(code)}`);
}

/** Confirma con el primer código: se activa y devuelve los códigos de recuperación (se muestran una vez). */
export async function enableMfa(userId: string, code: string, mail: Mailer = sendEmail) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt) throw new AppError(400, "La verificación en dos pasos ya está activa");
  if (!user.totpSecret) throw new AppError(400, "Primero escanea el código QR");
  if (!verifyTotp(openSecret(user.totpSecret, appSecret()), code)) {
    throw new AppError(400, "El código no es correcto. Revisa que la hora del teléfono esté bien.");
  }
  const codes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpRecoveryHashes: codes.map(recoveryHash) },
  });
  await mail({
    to: user.email,
    subject: "Activaste la verificación en dos pasos",
    text: `Hola ${user.name}:\n\nActivaste la verificación en dos pasos en ComercioClaro. Desde ahora, al iniciar sesión te pediremos el código de tu app de autenticación.\n\nSi no fuiste tú, cambia tu contraseña de inmediato.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>Activaste la verificación en dos pasos en ComercioClaro. Desde ahora, al iniciar sesión te pediremos el código de tu app de autenticación.</p><p>Si no fuiste tú, cambia tu contraseña de inmediato.</p>`,
  }).catch(() => false);
  return { recoveryCodes: codes };
}

/**
 * Valida un código de la app o uno de recuperación (este se gasta). Devuelve si se usó uno de
 * recuperación y cuántos quedan.
 */
export async function verifyMfaCode(userId: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt || !user.totpSecret) return { ok: false as const };
  if (verifyTotp(openSecret(user.totpSecret, appSecret()), code)) return { ok: true as const, recovery: false };
  const hash = recoveryHash(code);
  if (normalizeRecoveryCode(code).length === 8 && user.totpRecoveryHashes.includes(hash)) {
    const left = user.totpRecoveryHashes.filter((h) => h !== hash);
    await prisma.user.update({ where: { id: userId }, data: { totpRecoveryHashes: left } });
    return { ok: true as const, recovery: true, left: left.length };
  }
  return { ok: false as const };
}

/** Desactiva (con contraseña y código). No se puede si es obligatoria para el usuario. */
export async function disableMfa(userId: string, password: string, code: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt) throw new AppError(400, "La verificación en dos pasos no está activa");
  const required = await mfaRequiredFor(user);
  if (required) {
    throw new AppError(
      403,
      required === "admin"
        ? "Los administradores de la plataforma deben usar la verificación en dos pasos"
        : "Uno de tus negocios exige la verificación en dos pasos"
    );
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw new AppError(400, "La contraseña no es correcta");
  if (!(await verifyMfaCode(userId, code)).ok) throw new AppError(400, "El código no es correcto");
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: null, totpSecret: null, totpRecoveryHashes: [] },
  });
  return { enabled: false };
}

/** Códigos de recuperación nuevos (los anteriores dejan de servir). */
export async function regenerateRecoveryCodes(userId: string, code: string) {
  const check = await verifyMfaCode(userId, code);
  if (!check.ok) throw new AppError(400, "El código no es correcto");
  const codes = generateRecoveryCodes();
  await prisma.user.update({ where: { id: userId }, data: { totpRecoveryHashes: codes.map(recoveryHash) } });
  return { recoveryCodes: codes };
}

/** Quitada por el super admin (teléfono perdido): se cierran sus sesiones. */
export async function resetMfaByAdmin(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabledAt: null, totpSecret: null, totpRecoveryHashes: [], tokenVersion: { increment: 1 } },
  });
}

export async function mfaStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true, totpEnabledAt: true, totpRecoveryHashes: true },
  });
  return {
    enabled: user.totpEnabledAt !== null,
    enabledAt: user.totpEnabledAt,
    recoveryLeft: user.totpRecoveryHashes.length,
    required: await mfaRequiredFor(user),
  };
}

// ---------- Reto de inicio de sesión (entre la contraseña y el código) ----------

export async function setMfaChallenge(userId: string, businessId: string) {
  const token = await new SignJWT({ purpose: "mfa", bid: businessId, nonce: crypto.randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MFA_TTL_SECONDS}s`)
    .sign(getJwtSecret());
  (await cookies()).set(MFA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MFA_TTL_SECONDS,
    path: "/api/auth",
  });
}

export async function readMfaChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (payload.purpose !== "mfa" || typeof payload.sub !== "string" || typeof payload.bid !== "string") return null;
    return { userId: payload.sub, businessId: payload.bid };
  } catch {
    return null;
  }
}

export async function clearMfaChallenge() {
  (await cookies()).set(MFA_COOKIE, "", { httpOnly: true, path: "/api/auth", maxAge: 0 });
}
