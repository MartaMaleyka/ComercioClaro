import { handler, parseBody, requestMeta } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { assertBelowRateLimit, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { mfaCodeSchema } from "@/lib/validation";
import { clearMfaChallenge, finishLogin, readMfaChallenge, recordLogin, verifyMfaCode } from "@/server/security";

const LIMIT = 6;
const WINDOW_SECONDS = 15 * 60;

/** Segundo paso del inicio de sesión: código de la app de autenticación o de recuperación. */
export const POST = handler(async (request) => {
  const challenge = await readMfaChallenge();
  if (!challenge) throw new AppError(401, "El tiempo para escribir el código terminó. Inicia sesión de nuevo.");
  const { code } = await parseBody(request, mfaCodeSchema);
  const meta = requestMeta(request);
  const key = `login:mfa:${challenge.userId}`;
  await assertBelowRateLimit(key, LIMIT);

  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || user.disabledAt) throw new AppError(401, "Inicia sesión de nuevo");
  const check = await verifyMfaCode(user.id, code);
  if (!check.ok) {
    await rateLimit(key, LIMIT, WINDOW_SECONDS).catch(() => undefined);
    await recordLogin({ userId: user.id, email: user.email, success: false, reason: "MFA_FAILED", meta });
    throw new AppError(400, "El código no es correcto");
  }
  await resetRateLimit(key);
  await resetRateLimit(`login:email:${user.email}`);
  await clearMfaChallenge();
  await finishLogin(user, challenge.businessId, meta);
  return {
    user: { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword },
    ...(check.recovery ? { recoveryLeft: check.left } : {}),
  };
});
