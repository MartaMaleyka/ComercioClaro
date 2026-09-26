import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma";
import { COOKIE_NAME, EXPIRY_SECONDS, createToken, verifyToken, type SessionPayload } from "./session-token";
import { AppError, forbidden, unauthorized } from "./errors";
import type { Role } from "@/generated/prisma/enums";

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

export interface AuthContext {
  userId: string;
  businessId: string;
  role: Role;
  user: { id: string; email: string; name: string; mustChangePassword: boolean; language: string };
  business: Awaited<ReturnType<typeof prisma.business.findUniqueOrThrow>>;
}

/** Valida la sesión contra la base de datos (versión de token y membresía vigente). */
export async function getAuth(): Promise<AuthContext | null> {
  const session = await readSession();
  if (!session) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: session.sub, businessId: session.bid } },
    include: { user: true, business: true },
  });
  if (!membership || membership.user.tokenVersion !== session.tv) return null;

  const { user, business } = membership;
  return {
    userId: user.id,
    businessId: business.id,
    role: membership.role,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword,
      language: user.language,
    },
    business,
  };
}

/** Exige sesión válida y, opcionalmente, uno de los roles indicados. */
export async function requireAuth(...roles: Role[]): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw unauthorized();
  if (roles.length > 0 && !roles.includes(auth.role)) throw forbidden();
  return auth;
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
