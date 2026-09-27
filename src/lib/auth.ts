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

export async function startSession(payload: SessionPayload) {
  const token = await createToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRY_SECONDS,
    path: "/",
  });
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
}

/** Usuario de la sesión, si el token sigue vigente y no está bloqueado. */
async function sessionUser(session: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.tokenVersion !== session.tv || user.disabledAt) return null;
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
  };
}

/**
 * Exige sesión válida y, opcionalmente, uno de los roles indicados. Un negocio suspendido o
 * con la prueba vencida no puede usarse (salvo el super admin como soporte).
 */
export async function requireAuth(...roles: Role[]): Promise<AuthContext> {
  const auth = await requireSession(...roles);
  if (auth.access.blocked && !auth.support) {
    throw new AppError(
      403,
      auth.access.reason === "trialEnded"
        ? "El periodo de prueba de este negocio terminó. Contacta al administrador para activar un plan."
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

export async function requireSuperAdmin() {
  const user = await getSuperAdmin();
  if (!user) {
    const session = await readSession();
    throw session ? forbidden() : unauthorized();
  }
  return user;
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
