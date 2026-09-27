import { handler } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { beginMfaSetup } from "@/server/security";

export const POST = handler(async () => {
  const { user } = await requireUserSession();
  return beginMfaSetup(user.id);
});
