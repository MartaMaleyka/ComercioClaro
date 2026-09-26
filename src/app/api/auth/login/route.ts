import { handler, parseBody, clientIp } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { assertBelowRateLimit, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/server/account";

const IP_LIMIT = 20;
const EMAIL_LIMIT = 8;
const WINDOW_SECONDS = 15 * 60;

export const POST = handler(async (request) => {
  const input = await parseBody(request, loginSchema);
  const ipKey = `login:ip:${clientIp(request)}`;
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
    throw err;
  }
  const { user, businessId } = result;
  await resetRateLimit(emailKey);
  await startSession({ sub: user.id, bid: businessId, tv: user.tokenVersion });

  return {
    user: { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword },
  };
});
