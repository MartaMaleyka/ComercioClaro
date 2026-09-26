import { prisma } from "./prisma";
import { AppError } from "./errors";

/**
 * Límite de intentos con ventana fija guardado en la base de datos, para que funcione
 * con varias instancias o funciones serverless.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const resetAt = new Date(Date.now() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;

  const row = rows[0];
  if (row && row.count > limit) {
    const minutes = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - Date.now()) / 60000));
    throw new AppError(429, `Demasiados intentos. Intenta de nuevo en ${minutes} min.`);
  }
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** Rechaza si la clave ya llegó al límite, sin sumar un intento (para contar solo los fallidos). */
export async function assertBelowRateLimit(key: string, limit: number) {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (row && row.resetAt > new Date() && row.count >= limit) {
    const minutes = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 60000));
    throw new AppError(429, `Demasiados intentos. Intenta de nuevo en ${minutes} min.`);
  }
}
