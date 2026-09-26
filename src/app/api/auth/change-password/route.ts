import { handler, parseBody } from "@/lib/api";
import { requireUserSession, startSession } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword } from "@/server/account";

export const POST = handler(async (request) => {
  const auth = await requireUserSession();
  const input = await parseBody(request, changePasswordSchema);
  const user = await changePassword(auth.user.id, input.currentPassword, input.newPassword);
  // Las demás sesiones quedan invalidadas; esta se renueva con la nueva versión.
  await startSession({ sub: user.id, bid: auth.businessId, tv: user.tokenVersion });
  return { success: true };
});
