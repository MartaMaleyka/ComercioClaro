import { handler } from "@/lib/api";
import { requireUserSession } from "@/lib/auth";
import { revokeSession } from "@/server/security";

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const { user } = await requireUserSession();
  return revokeSession(user.id, (await params).id);
});
