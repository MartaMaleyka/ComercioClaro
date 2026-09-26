const DEV_FALLBACK_SECRET = "comercio-claro-dev-only-secret-no-usar-en-produccion";

let warned = false;

/**
 * Devuelve la clave para firmar sesiones. En producción es obligatoria y debe tener
 * al menos 32 caracteres; sin ella la app se niega a emitir o validar sesiones.
 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET debe estar configurada (mínimo 32 caracteres) en producción");
  }
  if (!warned) {
    warned = true;
    console.warn("[auth] JWT_SECRET no configurada o muy corta; usando clave de desarrollo.");
  }
  return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

export function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
