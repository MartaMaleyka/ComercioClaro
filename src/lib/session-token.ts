import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "./env";

// Solo depende de jose para poder usarse en proxy.ts sin cargar Prisma.

export const COOKIE_NAME = "comercio-claro-session";
export const EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  /** userId */
  sub: string;
  /** negocio (sucursal) activo */
  bid: string;
  /** versión de token del usuario; si cambia, la sesión deja de ser válida */
  tv: number;
  /** sesión (dispositivo) en la base de datos, para verla y cerrarla sola */
  sid?: string;
}

export async function createToken(payload: SessionPayload) {
  return new SignJWT({ bid: payload.bid, tv: payload.tv, ...(payload.sid ? { sid: payload.sid } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.bid !== "string" || typeof payload.tv !== "number") {
      return null;
    }
    return {
      sub: payload.sub,
      bid: payload.bid,
      tv: payload.tv,
      ...(typeof payload.sid === "string" ? { sid: payload.sid } : {}),
    };
  } catch {
    return null;
  }
}
