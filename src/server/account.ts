import crypto from "crypto";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Role } from "@/generated/prisma/enums";
import { countryConfig } from "@/lib/country";
import { D } from "@/lib/decimal";
import type { Actor } from "./inventory";
import { assertWithinLimit } from "./limits";
import { TERMS_VERSION, businessTypeLabel, type BusinessType } from "@/lib/business-types";

const RESET_TTL_MS = 60 * 60 * 1000;

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  businessName: string;
  country?: "MX" | "PA" | "OTHER";
  phone?: string | null;
  businessType?: BusinessType;
  plan?: string | null;
}

/**
 * Registro desde la página pública: crea el dueño y su negocio, guarda la aceptación de los
 * términos, envía la bienvenida con el enlace para confirmar el correo y avisa al super admin.
 */
export async function registerAccount(input: RegisterInput, mail: typeof sendEmail = sendEmail) {
  const country = countryConfig(input.country ?? "MX");
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "Ya existe una cuenta con este correo");
  const { plan, data: subscription } = await initialSubscription(input.plan ?? null);
  const type = input.businessType ?? "OTRO";
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const now = new Date();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
        emailVerifyHash: hashToken(verifyToken),
        emailVerifyExpires: new Date(now.getTime() + VERIFY_TTL_MS),
        memberships: {
          create: {
            role: "OWNER",
            business: {
              create: {
                name: input.businessName,
                phone: input.phone ?? null,
                businessType: type,
                signupSource: "SELF",
                country: country.code,
                currency: country.currency,
                locale: country.locale,
                timezone: country.timezone,
                showBalboa: country.showBalboa,
                // Configuración sugerida por el tipo (solo se ve si el plan incluye la función).
                ...(type === "FONDA" ? { restaurantMode: true } : {}),
                ...subscription,
              },
            },
          },
        },
      },
      include: { memberships: true },
    });
    await tx.adminAuditLog.create({
      data: {
        action: "business.register",
        entity: "Business",
        entityId: created.memberships[0].businessId,
        userId: created.id,
        details: {
          name: input.businessName,
          email: input.email,
          type,
          country: country.code,
          plan: plan?.code ?? null,
        },
      },
    });
    return created;
  });
  const businessId = user.memberships[0].businessId;

  // Los correos no deben impedir el registro: si fallan, el dueño puede pedir otro enlace.
  await sendWelcome(mail, user, input.businessName, verifyToken, subscription).catch(() => undefined);
  await notifyAdminsOfSignup(mail, { business: input.businessName, owner: user, type, country: country.code, plan: plan?.name ?? null }).catch(
    () => undefined
  );

  // Un plan de pago sin prueba empieza pendiente de pago: lo primero es pagar en línea (si está disponible).
  const pendingPayment = Boolean(plan && subscription.status === "ACTIVE" && subscription.paidUntil);
  const next = pendingPayment && process.env.BILLING_PROVIDER ? "/configuracion/plan" : "/dashboard";
  return { user, businessId, next };
}

async function sendWelcome(
  mail: typeof sendEmail,
  user: { email: string; name: string },
  businessName: string,
  verifyToken: string,
  subscription: { trialEndsAt?: Date }
) {
  const link = `${getAppUrl()}/verificar-correo?token=${verifyToken}`;
  const trial = subscription.trialEndsAt
    ? `Tu periodo de prueba termina el ${new Intl.DateTimeFormat("es", { dateStyle: "long" }).format(subscription.trialEndsAt)}.`
    : "";
  const steps = [
    "Agrega tus productos (o impórtalos desde Excel).",
    "Abre la caja y haz tu primera venta.",
    "Invita a tus cajeros desde Configuración → Usuarios.",
  ];
  await mail({
    to: user.email,
    subject: `Bienvenido a ComercioClaro · ${businessName}`,
    text: [
      `Hola ${user.name}:`,
      "",
      `Ya puedes usar ComercioClaro en ${businessName}. ${trial}`,
      "",
      `Confirma tu correo (el enlace vale 24 horas): ${link}`,
      "",
      "Primeros pasos:",
      ...steps.map((s) => `• ${s}`),
      "",
      `Entrar: ${getAppUrl()}/login`,
    ].join("\n"),
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p>Ya puedes usar ComercioClaro en <strong>${escapeHtml(businessName)}</strong>. ${escapeHtml(trial)}</p><p><a href="${link}">Confirmar mi correo</a> (el enlace vale 24 horas)</p><p>Primeros pasos:</p><ul>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`,
  });
}

/** Aviso a los administradores de la plataforma de cada negocio que se registra. */
async function notifyAdminsOfSignup(
  mail: typeof sendEmail,
  info: { business: string; owner: { email: string; name: string }; type: string; country: string; plan: string | null }
) {
  const admins = await prisma.user.findMany({ where: { isSuperAdmin: true, disabledAt: null }, select: { email: true } });
  const lines = [
    `Negocio: ${info.business}`,
    `Dueño: ${info.owner.name} <${info.owner.email}>`,
    `Tipo: ${businessTypeLabel(info.type) ?? info.type}`,
    `País: ${info.country}`,
    `Plan: ${info.plan ?? "sin plan"}`,
  ];
  for (const admin of admins) {
    await mail({
      to: admin.email,
      subject: `Nuevo registro: ${info.business}`,
      text: [...lines, "", `Ver en el panel: ${getAppUrl()}/admin/negocios`].join("\n"),
      html: `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul><p><a href="${getAppUrl()}/admin/negocios">Ver en el panel</a></p>`,
    });
  }
}

/** Nuevo enlace para confirmar el correo (el anterior deja de servir). */
export async function sendVerificationEmail(userId: string, mail: typeof sendEmail = sendEmail) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { alreadyVerified: true };
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerifyHash: hashToken(token), emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  const link = `${getAppUrl()}/verificar-correo?token=${token}`;
  await mail({
    to: user.email,
    subject: "Confirma tu correo de ComercioClaro",
    text: `Hola ${user.name}:\n\nConfirma tu correo con este enlace (vale 24 horas):\n${link}\n\nSi no creaste una cuenta, ignora este correo.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p><p><a href="${link}">Confirmar mi correo</a> (el enlace vale 24 horas)</p><p>Si no creaste una cuenta, ignora este correo.</p>`,
  });
  return { alreadyVerified: false };
}

export async function verifyEmail(token: string) {
  const user = await prisma.user.findUnique({ where: { emailVerifyHash: hashToken(token) } });
  if (!user || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
    throw new AppError(400, "El enlace de confirmación no es válido o ya venció. Pide otro desde la app.");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyHash: null, emailVerifyExpires: null },
  });
  return { email: user.email };
}

/**
 * Plan con el que empieza un negocio nuevo: el elegido en la página de precios (si es público y
 * está activo) o el plan por defecto, con sus días de prueba. Sin planes configurados, sin plan.
 */
async function initialSubscription(code: string | null) {
  const chosen = code
    ? await prisma.plan.findFirst({ where: { code, active: true, isPublic: true } })
    : null;
  const plan = chosen ?? (await prisma.plan.findFirst({ where: { isDefault: true, active: true } }));
  if (!plan) return { plan: null, data: {} as SubscriptionData };
  const data: SubscriptionData =
    plan.trialDays > 0
      ? {
          planId: plan.id,
          status: "TRIAL",
          trialEndsAt: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
        }
      : // Sin prueba: un plan de pago queda pendiente de su primer pago (aviso de pago vencido).
        { planId: plan.id, status: "ACTIVE", paidUntil: D(plan.priceMonthly).gt(0) ? new Date() : null };
  return { plan, data };
}

interface SubscriptionData {
  planId?: string;
  status?: "TRIAL" | "ACTIVE";
  trialEndsAt?: Date;
  paidUntil?: Date | null;
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
  if (user.disabledAt) throw new AppError(403, "Tu usuario está bloqueado. Contacta al administrador.");
  // El super admin puede no pertenecer a ningún negocio: entra al panel de administración.
  if (user.memberships.length === 0 && user.isSuperAdmin) return { user, businessId: "" };
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
    await assertWithinLimit(tx, actor, "branches");
    const branch = await tx.business.create({
      data: {
        name: input.name,
        country: source.country,
        currency: source.currency,
        locale: source.locale,
        timezone: source.timezone,
        showBalboa: source.showBalboa,
        ruc: source.ruc,
        dv: source.dv,
        yappyDirectory: source.yappyDirectory,
        yappyQr: source.yappyQr,
        cardFeeRate: source.cardFeeRate,
        transferFeeRate: source.transferFeeRate,
        yappyFeeRate: source.yappyFeeRate,
        rfc: source.rfc,
        legalName: source.legalName,
        taxRegime: source.taxRegime,
        // La sucursal comparte la suscripción del negocio del que sale.
        planId: source.planId,
        status: source.status,
        trialEndsAt: source.trialEndsAt,
        paidUntil: source.paidUntil,
        billingCycle: source.billingCycle,
        ...(source.featureOverrides ? { featureOverrides: source.featureOverrides } : {}),
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
            trackStock: p.trackStock,
            seniorEligible: p.seniorEligible,
            packSize: p.packSize,
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

export function temporaryPassword() {
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
  await assertWithinLimit(prisma, actor, "users");

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
