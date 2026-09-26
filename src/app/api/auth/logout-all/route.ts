import { handler } from "@/lib/api";
import { clearSessionCookie, requireAuth } from "@/lib/auth";
import { revokeAllSessions } from "@/server/account";

export const POST = handler(async () => {
  const auth = await requireAuth();
  await revokeAllSessions(auth.userId);
  await clearSessionCookie();
  return { success: true };
});
