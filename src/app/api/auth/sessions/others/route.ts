import { handler } from "@/lib/api";
import { currentSessionId, requireUserSession } from "@/lib/auth";
import { revokeOtherSessions } from "@/server/security";

/** Cierra las sesiones de los demás dispositivos. */
export const POST = handler(async () => {
  const { user } = await requireUserSession();
  return revokeOtherSessions(user.id, await currentSessionId());
});
