import { handler, parseBody } from "@/lib/api";
import { requireAuth, startSession } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword } from "@/server/account";

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, changePasswordSchema);
  const user = await changePassword(auth.userId, input.currentPassword, input.newPassword);
  // Las demás sesiones quedan invalidadas; esta se renueva con la nueva versión.
  await startSession({ sub: user.id, bid: auth.businessId, tv: user.tokenVersion });
  return { success: true };
});
