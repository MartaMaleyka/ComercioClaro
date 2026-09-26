import { handler } from "@/lib/api";
import { clearSessionCookie, requireUserSession } from "@/lib/auth";
import { revokeAllSessions } from "@/server/account";

export const POST = handler(async () => {
  const auth = await requireUserSession();
  await revokeAllSessions(auth.user.id);
  await clearSessionCookie();
  return { success: true };
});
