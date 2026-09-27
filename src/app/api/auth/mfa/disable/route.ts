import { handler, parseBody } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { mfaDisableSchema } from "@/lib/validation";
import { disableMfa } from "@/server/security";

export const POST = handler(async (request) => {
  const { user } = await requireUserSession();
  await rateLimit(`mfa:disable:${user.id}`, 5, 15 * 60);
  const { password, code } = await parseBody(request, mfaDisableSchema);
  return disableMfa(user.id, password, code);
});
