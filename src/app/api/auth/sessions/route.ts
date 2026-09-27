import { handler } from "@/lib/api";
import { currentSessionId, requireUserSession } from "@/lib/auth";
import { listSessions, loginHistory } from "@/server/security";

/** Sesiones abiertas (dispositivos) y últimos inicios de sesión del usuario. */
export const GET = handler(async () => {
  const { user } = await requireUserSession();
  const [sessions, history] = await Promise.all([
    listSessions(user.id, await currentSessionId()),
    loginHistory(user.id),
  ]);
  return { sessions, history };
});
