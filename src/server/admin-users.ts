import crypto from "crypto";
import { AppError, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { adminAudit } from "./admin";
import { describeDevice, loginHistory, resetMfaByAdmin } from "./security";

/** Seguridad de los usuarios desde el panel del super admin. */

interface Admin {
  id: string;
}

type Mailer = typeof sendEmail;

/** Negocios, sesiones abiertas y últimos inicios de sesión de un usuario. */
export async function adminUserSecurity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { business: { select: { id: true, name: true, status: true } } } } },
  });
  if (!user) throw notFound("Usuario");
  const [sessions, history] = await Promise.all([
    prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, tokenVersion: user.tokenVersion },
      orderBy: { lastSeenAt: "desc" },
    }),
    loginHistory(userId, 30),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    mfaEnabled: user.totpEnabledAt !== null,
    lastLoginAt: user.lastLoginAt,
    memberships: user.memberships.map((m) => ({ role: m.role, business: m.business })),
    sessions: sessions.map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      ip: s.ip,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
    })),
    history: history.map((h) => ({ ...h, device: describeDevice(h.userAgent) })),
  };
}

export async function adminRevokeUserSession(admin: Admin, userId: string, sessionId: string) {
  const { count } = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new AppError(404, "La sesión ya estaba cerrada");
  await adminAudit(prisma, admin, "user.session", "User", userId, { sessionId });
  return { revoked: true };
}

/** El usuario perdió su teléfono: se quita la verificación en dos pasos y se cierran sus sesiones. */
export async function adminResetMfa(admin: Admin, userId: string, mail: Mailer = sendEmail) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario");
  if (!user.totpEnabledAt) throw new AppError(400, "Este usuario no tiene la verificación en dos pasos");
  await resetMfaByAdmin(userId);
  await adminAudit(prisma, admin, "user.mfaReset", "User", userId, { email: user.email });
  await mail({
    to: user.email,
    subject: "Se quitó la verificación en dos pasos de tu cuenta",
    text: `Hola ${user.name}:\n\nEl equipo de ComercioClaro quitó la verificación en dos pasos de tu cuenta, como pediste. Se cerraron tus sesiones.\n\nVuelve a activarla en ${getAppUrl()}/seguridad. Si no lo pediste, escríbenos de inmediato.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>El equipo de ComercioClaro quitó la verificación en dos pasos de tu cuenta, como pediste. Se cerraron tus sesiones.</p><p><a href="${getAppUrl()}/seguridad">Vuelve a activarla</a>. Si no lo pediste, escríbenos de inmediato.</p>`,
  }).catch(() => false);
  return { mfaEnabled: false };
}

/**
 * Cambia el correo de un usuario: queda sin confirmar (se envía el enlace al nuevo), se cierran
 * sus sesiones y se avisa al correo anterior.
 */
export async function adminChangeEmail(admin: Admin, userId: string, email: string, mail: Mailer = sendEmail) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Usuario");
  if (user.email === email) throw new AppError(400, "Es el mismo correo");
  if (await prisma.user.findUnique({ where: { email } }))
    throw new AppError(409, "Ya existe una cuenta con ese correo");
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email,
        emailVerifiedAt: null,
        emailVerifyHash: hashToken(token),
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tokenVersion: { increment: 1 },
      },
    });
    await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await adminAudit(tx, admin, "user.email", "User", userId, { from: user.email, to: email });
  });
  const link = `${getAppUrl()}/verificar-correo?token=${token}`;
  await mail({
    to: email,
    subject: "Confirma tu nuevo correo de ComercioClaro",
    text: `Hola ${user.name}:\n\nTu cuenta de ComercioClaro ahora usa este correo. Confírmalo con este enlace (vale 24 horas):\n${link}`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>Tu cuenta de ComercioClaro ahora usa este correo. <a href="${link}">Confírmalo aquí</a> (vale 24 horas).</p>`,
  }).catch(() => false);
  await mail({
    to: user.email,
    subject: "Cambió el correo de tu cuenta de ComercioClaro",
    text: `Hola ${user.name}:\n\nEl correo de tu cuenta cambió a ${email}. Si no lo pediste, escríbenos de inmediato.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>El correo de tu cuenta cambió a <strong>${escapeHtml(email)}</strong>. Si no lo pediste, escríbenos de inmediato.</p>`,
  }).catch(() => false);
  return { email };
}
