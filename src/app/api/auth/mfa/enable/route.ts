import { handler, parseBody } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { mfaCodeSchema } from "@/lib/validation";
import { enableMfa } from "@/server/security";

export const POST = handler(async (request) => {
  const { user } = await requireUserSession();
  await rateLimit(`mfa:enable:${user.id}`, 10, 15 * 60);
  const { code } = await parseBody(request, mfaCodeSchema);
  return enableMfa(user.id, code);
});
