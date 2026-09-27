import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma";
import { COOKIE_NAME, EXPIRY_SECONDS, createToken, verifyToken, type SessionPayload } from "./session-token";
import { AppError, forbidden, unauthorized } from "./errors";
import type { Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { accessState, featureLabel, resolveFeatures, type AccessState, type FeatureKey } from "./features";

export { COOKIE_NAME, verifyToken, type SessionPayload };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Datos del dispositivo al abrir una sesión nueva. */
export interface SessionMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Guarda la cookie de sesión. Con `meta` abre una sesión nueva (inicio de sesión o registro);
 * sin él conserva la del dispositivo actual (cambiar de negocio, soporte, nueva contraseña).
 */
export async function startSession(payload: SessionPayload, meta?: SessionMeta) {
  let sid = payload.sid;
  if (meta) {
    const record = await prisma.userSession.create({
      data: {
        userId: payload.sub,
        tokenVersion: payload.tv,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + EXPIRY_SECONDS * 1000),
      },
    });
    sid = record.id;
  } else if (!sid) {
    const current = await readSession();
    if (current?.sid && current.sub === payload.sub) {
      sid = current.sid;
      // Tras cambiar la contraseña la sesión actual sigue valiendo con la versión nueva.
      await prisma.userSession.updateMany({
        where: { id: sid, userId: payload.sub },
        data: { tokenVersion: payload.tv },
      });
    }
  }
  const token = await createToken({ ...payload, ...(sid ? { sid } : {}) });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRY_SECONDS,
    path: "/",
  });
  return sid ?? null;
}

const TOUCH_MS = 5 * 60 * 1000;

/**
 * ¿La sesión (dispositivo) sigue abierta? Las sesiones sin id (anteriores a este cambio) valen hasta
 * que venzan. Actualiza la última actividad cada 5 minutos.
 */
async function sessionActive(session: SessionPayload, tokenVersion: number) {
  if (!session.sid) return true;
  const record = await prisma.userSession.findUnique({ where: { id: session.sid } });
  if (!record || record.userId !== session.sub || record.revokedAt || record.expiresAt < new Date()) return false;
  if (record.tokenVersion !== tokenVersion) return false;
  if (Date.now() - record.lastSeenAt.getTime() > TOUCH_MS) {
    await prisma.userSession
      .update({ where: { id: record.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
  return true;
}

/** Id de la sesión actual (para marcarla como "este dispositivo"). */
export async function currentSessionId() {
  return (await readSession())?.sid ?? null;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

type BusinessWithPlan = Prisma.BusinessGetPayload<{ include: { plan: true } }>;

export interface AuthContext {
  userId: string;
  businessId: string;
  role: Role;
  user: {
    id: string;
    email: string;
    name: string;
    mustChangePassword: boolean;
    language: string;
    isSuperAdmin: boolean;
    emailVerified: boolean;
  };
  business: BusinessWithPlan;
  /** Funciones activas del negocio (plan + ajustes del super admin) */
  features: FeatureKey[];
  /** Negocio suspendido o con la prueba vencida, y avisos de prueba o pago */
  access: AccessState;
  /** El super admin entró al negocio como soporte (sin ser miembro) */
  support: boolean;
  /** El negocio exige la verificación en dos pasos y el usuario aún no la activa */
  mfaSetupRequired: boolean;
}

/** Usuario de la sesión, si el token sigue vigente y no está bloqueado. */
async function sessionUser(session: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.tokenVersion !== session.tv || user.disabledAt) return null;
  if (!(await sessionActive(session, user.tokenVersion))) return null;
  return user;
}

/** Valida la sesión contra la base de datos (versión de token y membresía vigente). */
export async function getAuth(): Promise<AuthContext | null> {
  const session = await readSession();
  if (!session || !session.bid) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.sub, businessId: session.bid } },
    include: { user: true, business: { include: { plan: true } } },
  });
  let user = membership?.user ?? null;
  let business = membership?.business ?? null;
  let role: Role = membership?.role ?? "OWNER";
  let support = false;
  if (!membership) {
    // El super admin puede entrar a cualquier negocio como soporte.
    user = await sessionUser(session);
    if (!user?.isSuperAdmin) return null;
    business = await prisma.business.findUnique({ where: { id: session.bid }, include: { plan: true } });
    if (!business) return null;
    role = "OWNER";
    support = true;
  }
  if (!user || !business || user.tokenVersion !== session.tv || user.disabledAt) return null;
  if (membership && !(await sessionActive(session, user.tokenVersion))) return null;

  return {
    userId: user.id,
    businessId: business.id,
    role,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword,
      language: user.language,
      isSuperAdmin: user.isSuperAdmin,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    business,
    features: resolveFeatures(business),
    access: accessState(business),
    support,
    mfaSetupRequired: !support && business.requireMfa && !user.totpEnabledAt,
  };
}

/**
 * Exige sesión válida y, opcionalmente, uno de los roles indicados. Un negocio suspendido o
 * con la prueba vencida no puede usarse (salvo el super admin como soporte).
 */
export async function requireAuth(...roles: Role[]): Promise<AuthContext> {
  const auth = await requireSession(...roles);
  if (auth.mfaSetupRequired) {
    throw new AppError(403, "Este negocio exige la verificación en dos pasos. Actívala en Seguridad para continuar.");
  }
  if (auth.access.blocked && !auth.support) {
    throw new AppError(
      403,
      auth.access.reason === "trialEnded"
        ? "El periodo de prueba de este negocio terminó. Contacta al administrador para activar un plan."
        : auth.access.reason === "pending"
          ? "Este negocio está en revisión. Te avisaremos por correo cuando esté aprobado."
          : auth.access.reason === "closed"
            ? "Este negocio fue dado de baja. Contacta al administrador."
            : "Este negocio está suspendido. Contacta al administrador."
    );
  }
  return auth;
}

/** Como requireAuth, pero deja pasar negocios bloqueados (cerrar sesión, cambiar de negocio, idioma). */
export async function requireSession(...roles: Role[]): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw unauthorized();
  if (roles.length > 0 && !roles.includes(auth.role)) throw forbidden();
  return auth;
}

/** Exige que el plan del negocio incluya la función. */
export function requireFeature(auth: Pick<AuthContext, "features">, feature: FeatureKey) {
  if (!auth.features.includes(feature)) {
    throw new AppError(403, `Tu plan no incluye ${featureLabel(feature)}. Pide al administrador que la active.`);
  }
}

/**
 * Sin la función de variantes y extras, se ignoran esos campos al guardar un producto
 * (lo que ya tenía se conserva).
 */
export function withoutVariants<T extends { modifiers?: unknown; variantGroup?: unknown; variantLabel?: unknown }>(
  auth: Pick<AuthContext, "features">,
  input: T
): T {
  if (hasFeature(auth, "variants")) return input;
  return { ...input, modifiers: undefined, variantGroup: undefined, variantLabel: undefined };
}

export function hasFeature(auth: Pick<AuthContext, "features">, feature: FeatureKey) {
  return auth.features.includes(feature);
}

/**
 * Usuario de la sesión aunque no haya negocio activo o esté bloqueado: para cambiar la contraseña,
 * el idioma, cerrar sesiones o cambiar de negocio.
 */
export async function requireUserSession() {
  const session = await readSession();
  const user = session ? await sessionUser(session) : null;
  if (!session || !user) throw unauthorized();
  return { user, businessId: session.bid };
}

/** Usuario super admin de la sesión (no depende de un negocio). */
export async function getSuperAdmin() {
  const session = await readSession();
  if (!session) return null;
  const user = await sessionUser(session);
  return user?.isSuperAdmin ? user : null;
}

/** El super admin debe tener activa la verificación en dos pasos (salvo ADMIN_MFA_REQUIRED=false). */
export function adminNeedsMfa(user: { totpEnabledAt: Date | null }) {
  return process.env.ADMIN_MFA_REQUIRED !== "false" && !user.totpEnabledAt;
}

export async function requireSuperAdmin() {
  const user = await getSuperAdmin();
  if (!user) {
    const session = await readSession();
    throw session ? forbidden() : unauthorized();
  }
  if (adminNeedsMfa(user)) {
    throw new AppError(403, "Activa la verificación en dos pasos en Seguridad para usar el panel de administración.");
  }
  return user;
}

/** Usuario de la sesión (sin exigir negocio): para las páginas de cuenta como Seguridad. */
export async function getSessionUser() {
  const session = await readSession();
  return session ? sessionUser(session) : null;
}

export function requireOwner(auth: AuthContext) {
  if (auth.role !== "OWNER") throw forbidden();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertPasswordStrength(password: string) {
  if (password.length < 8) {
    throw new AppError(400, "La contraseña debe tener al menos 8 caracteres");
  }
  if (password.length > 128) {
    throw new AppError(400, "La contraseña es demasiado larga");
  }
}
