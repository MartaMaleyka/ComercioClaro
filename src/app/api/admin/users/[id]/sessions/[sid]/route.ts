import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminRevokeUserSession } from "@/server/admin-users";

export const DELETE = handler<{ id: string; sid: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  const { id, sid } = await params;
  return adminRevokeUserSession(admin, id, sid);
});
