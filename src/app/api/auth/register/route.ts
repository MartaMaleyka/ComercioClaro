import { handler, parseBody, clientIp, requestMeta } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { registerAccount } from "@/server/account";
import { recordLogin } from "@/server/security";

/** Menos de esto entre abrir el formulario y enviarlo no lo hace una persona. */
const MIN_FILL_MS = 2500;

export const POST = handler(async (request) => {
  await rateLimit(`register:ip:${clientIp(request)}`, 5, 60 * 60);
  // acceptTerms ya lo exige el esquema (debe ser true); registerAccount guarda la fecha y la versión.
  const { website, elapsedMs, ...rest } = await parseBody(request, registerSchema);
  const { acceptTerms, ...input } = rest;
  void acceptTerms;
  // Campo trampa lleno o formulario enviado al instante: es un bot.
  if (website || (elapsedMs !== undefined && elapsedMs < MIN_FILL_MS)) {
    throw new AppError(400, "No pudimos crear la cuenta. Revisa los datos e intenta de nuevo.");
  }
  const { user, businessId, next } = await registerAccount(input);
  const meta = requestMeta(request);
  await startSession({ sub: user.id, bid: businessId, tv: user.tokenVersion }, meta);
  await recordLogin({ userId: user.id, email: user.email, success: true, reason: "OK", meta });
  return { user: { id: user.id, email: user.email, name: user.name }, next };
});
