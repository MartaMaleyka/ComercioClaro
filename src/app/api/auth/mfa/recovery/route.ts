import { handler, parseBody } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { mfaCodeSchema } from "@/lib/validation";
import { regenerateRecoveryCodes } from "@/server/security";

export const POST = handler(async (request) => {
  const { user } = await requireUserSession();
  await rateLimit(`mfa:recovery:${user.id}`, 5, 15 * 60);
  const { code } = await parseBody(request, mfaCodeSchema);
  return regenerateRecoveryCodes(user.id, code);
});
