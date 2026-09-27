import { handler, parseBody, requestMeta } from "@/lib/api";
import { assertBelowRateLimit, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/server/account";
import { failureReason, finishLogin, recordLogin, setMfaChallenge } from "@/server/security";

const IP_LIMIT = 20;
const EMAIL_LIMIT = 8;
const WINDOW_SECONDS = 15 * 60;

export const POST = handler(async (request) => {
  const input = await parseBody(request, loginSchema);
  const meta = requestMeta(request);
  const ipKey = `login:ip:${meta.ip}`;
  const emailKey = `login:email:${input.email}`;
  await assertBelowRateLimit(ipKey, IP_LIMIT);
  await assertBelowRateLimit(emailKey, EMAIL_LIMIT);

  let result;
  try {
    result = await authenticate(input);
  } catch (err) {
    // Solo los intentos fallidos cuentan para el límite (frena la fuerza bruta sin bloquear a quien entra bien).
    await rateLimit(ipKey, IP_LIMIT, WINDOW_SECONDS).catch(() => undefined);
    await rateLimit(emailKey, EMAIL_LIMIT, WINDOW_SECONDS).catch(() => undefined);
    const { userId, reason } = await failureReason(input.email);
    await recordLogin({ userId, email: input.email, success: false, reason, meta }).catch(() => undefined);
    throw err;
  }
  const { user, businessId } = result;

  // Con verificación en dos pasos, la contraseña sola no abre la sesión: falta el código.
  if (user.totpEnabledAt) {
    await setMfaChallenge(user.id, businessId);
    await recordLogin({ userId: user.id, email: user.email, success: false, reason: "MFA_REQUIRED", meta });
    return { mfaRequired: true };
  }

  await resetRateLimit(emailKey);
  await finishLogin(user, businessId, meta);
  return {
    user: { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword },
  };
});
