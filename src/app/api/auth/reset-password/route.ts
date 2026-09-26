import { handler, parseBody, clientIp } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { resetConfirmSchema, resetRequestSchema } from "@/lib/validation";
import { confirmPasswordReset, requestPasswordReset } from "@/server/account";

const GENERIC_MESSAGE = "Si el correo existe, recibirás instrucciones para recuperar tu contraseña";

/** Solicitar enlace de recuperación. La respuesta es la misma exista o no el correo. */
export const POST = handler(async (request) => {
  const { email } = await parseBody(request, resetRequestSchema);
  await rateLimit(`reset:ip:${clientIp(request)}`, 10, 60 * 60);
  await rateLimit(`reset:email:${email}`, 3, 60 * 60);
  await requestPasswordReset(email);
  return { success: true, message: GENERIC_MESSAGE };
});

/** Confirmar nueva contraseña con el token recibido por correo. */
export const PUT = handler(async (request) => {
  await rateLimit(`reset-confirm:ip:${clientIp(request)}`, 10, 15 * 60);
  const { token, password } = await parseBody(request, resetConfirmSchema);
  await confirmPasswordReset(token, password);
  return { success: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." };
});
