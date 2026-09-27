import { handler } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { mfaStatus } from "@/server/security";

export const GET = handler(async () => {
  const { user } = await requireUserSession();
  return mfaStatus(user.id);
});
