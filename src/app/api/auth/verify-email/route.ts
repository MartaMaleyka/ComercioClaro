import { handler, parseBody, clientIp } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { verifyEmailSchema } from "@/lib/validation";
import { verifyEmail } from "@/server/account";

/** Público: el enlace del correo funciona aunque se abra en otro dispositivo sin sesión. */
export const POST = handler(async (request) => {
  await rateLimit(`verify-email:ip:${clientIp(request)}`, 20, 60 * 60);
  const { token } = await parseBody(request, verifyEmailSchema);
  return verifyEmail(token);
});
