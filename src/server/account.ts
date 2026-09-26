import crypto from "crypto";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Role } from "@/generated/prisma/enums";
import type { Actor } from "./inventory";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function registerAccount(input: { email: string; password: string; name: string; businessName: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "Ya existe una cuenta con este correo");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name,
      memberships: { create: { role: "OWNER", business: { create: { name: input.businessName } } } },
    },
    include: { memberships: true },
  });
  return { user, businessId: user.memberships[0].businessId };
}

/** Valida credenciales y devuelve el negocio con el que inicia la sesión. */
export async function authenticate(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { memberships: { orderBy: { createdAt: "asc" } } },
  });
  // Compara siempre contra un hash para no revelar si el correo existe por el tiempo de respuesta.
  const hash = user?.passwordHash ?? "$2b$12$oydGX.VzPsccZ01xYi4/rePMaX3YgZliEa2MxX5AIdX1KBrGeM4Xu";
  const valid = await verifyPassword(input.password, hash);
  if (!user || !valid) throw new AppError(401, "Correo o contraseña incorrectos");
  if (user.memberships.length === 0) throw new AppError(403, "Tu usuario no tiene acceso a ningún negocio");
  return { user, businessId: user.memberships[0].businessId };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(token), resetExpires: new Date(Date.now() + RESET_TTL_MS) },
  });

  const link = `${getAppUrl()}/recuperar-contrasena?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Recupera tu contraseña de ComercioClaro",
    text: `Hola ${user.name}:\n\nPara crear una nueva contraseña abre este enlace (válido por 1 hora):\n${link}\n\nSi no lo solicitaste, ignora este correo.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>Para crear una nueva contraseña haz clic en el siguiente enlace (válido por 1 hora):</p><p><a href="${link}">Restablecer contraseña</a></p><p>Si no lo solicitaste, ignora este correo.</p>`,
  });
}

export async function confirmPasswordReset(token: string, password: string) {
  const user = await prisma.user.findUnique({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetExpires || user.resetExpires < new Date()) {
    throw new AppError(400, "El enlace de recuperación no es válido o ha expirado");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetExpires: null,
      mustChangePassword: false,
      // Invalida todas las sesiones abiertas.
      tokenVersion: { increment: 1 },
    },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, tokenVersion: { increment: 1 } },
  });
}

/** Cierra todas las sesiones del usuario en todos los dispositivos. */
export async function revokeAllSessions(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

export async function listMemberships(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Crea una sucursal (nuevo negocio) del mismo dueño; opcionalmente copia el catálogo sin existencias. */
export async function createBranch(actor: Actor, input: { name: string; copyCatalog: boolean }) {
  const source = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
  return prisma.$transaction(async (tx) => {
    const branch = await tx.business.create({
      data: {
        name: input.name,
        currency: source.currency,
        locale: source.locale,
        timezone: source.timezone,
        rfc: source.rfc,
        legalName: source.legalName,
        taxRegime: source.taxRegime,
        memberships: { create: { userId: actor.userId, role: "OWNER" } },
      },
    });

    if (input.copyCatalog) {
      const categories = await tx.category.findMany({ where: { businessId: actor.businessId } });
      const categoryMap = new Map<string, string>();
      for (const c of categories) {
        const created = await tx.category.create({ data: { name: c.name, businessId: branch.id } });
        categoryMap.set(c.id, created.id);
      }
      const products = await tx.product.findMany({ where: { businessId: actor.businessId, archivedAt: null } });
      if (products.length > 0) {
        await tx.product.createMany({
          data: products.map((p) => ({
            name: p.name,
            description: p.description,
            sku: p.sku,
            barcode: p.barcode,
            unit: p.unit,
            price: p.price,
            wholesalePrice: p.wholesalePrice,
            wholesaleMinQty: p.wholesaleMinQty,
            cost: p.cost,
            minStock: p.minStock,
            trackExpiry: p.trackExpiry,
            taxRate: p.taxRate,
            iepsRate: p.iepsRate,
            satProductKey: p.satProductKey,
            satUnitKey: p.satUnitKey,
            categoryId: p.categoryId ? (categoryMap.get(p.categoryId) ?? null) : null,
            businessId: branch.id,
          })),
        });
      }
    }
    await audit(tx, actor, "branch.create", "Business", branch.id, { name: input.name });
    return branch;
  });
}

function temporaryPassword() {
  // 12 caracteres legibles (sin 0/O, 1/l).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Agrega un usuario al negocio. Si no existe se crea con contraseña temporal
 * que debe cambiar al entrar; se intenta enviar por correo y se devuelve una vez al dueño.
 */
export async function addMember(actor: Actor, input: { name: string; email: string; role: Role }) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
  let user = await prisma.user.findUnique({ where: { email: input.email } });
  let tempPassword: string | null = null;

  if (!user) {
    tempPassword = temporaryPassword();
    user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
      },
    });
  }

  const exists = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId: actor.businessId } },
  });
  if (exists) throw new AppError(409, "Ese usuario ya pertenece al negocio");

  const membership = await prisma.$transaction(async (tx) => {
    const m = await tx.membership.create({
      data: { userId: user.id, businessId: actor.businessId, role: input.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    await audit(tx, actor, "member.add", "Membership", m.id, { email: input.email, role: input.role });
    return m;
  });

  const loginUrl = `${getAppUrl()}/login`;
  const emailed = await sendEmail({
    to: input.email,
    subject: `Te invitaron a ${business.name} en ComercioClaro`,
    text: tempPassword
      ? `Hola ${input.name}:\n\nTe dieron acceso a ${business.name}.\nEntra en ${loginUrl} con tu correo y la contraseña temporal: ${tempPassword}\nTe pediremos cambiarla al entrar.`
      : `Hola ${input.name}:\n\nTe dieron acceso a ${business.name}. Entra en ${loginUrl} con tu cuenta de siempre.`,
    html: tempPassword
      ? `<p>Hola ${escapeHtml(input.name)}:</p><p>Te dieron acceso a <b>${escapeHtml(business.name)}</b>.</p><p>Entra en <a href="${loginUrl}">${loginUrl}</a> con tu correo y la contraseña temporal: <code>${tempPassword}</code></p><p>Te pediremos cambiarla al entrar.</p>`
      : `<p>Hola ${escapeHtml(input.name)}:</p><p>Te dieron acceso a <b>${escapeHtml(business.name)}</b>. Entra en <a href="${loginUrl}">${loginUrl}</a>.</p>`,
  });

  return { membership, tempPassword, emailed };
}

export async function removeMember(actor: Actor, membershipId: string) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, businessId: actor.businessId } });
  if (!membership) throw notFound("Usuario");
  if (membership.userId === actor.userId) throw new AppError(400, "No puedes quitarte a ti mismo");
  if (membership.role === "OWNER") {
    const owners = await prisma.membership.count({ where: { businessId: actor.businessId, role: "OWNER" } });
    if (owners <= 1) throw forbidden();
  }
  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: membershipId } });
    // Cierra las sesiones activas del usuario removido.
    await tx.user.update({ where: { id: membership.userId }, data: { tokenVersion: { increment: 1 } } });
    await audit(tx, actor, "member.remove", "Membership", membershipId, { userId: membership.userId });
  });
}
