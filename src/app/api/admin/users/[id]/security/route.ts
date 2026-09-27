import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminUserSecurity } from "@/server/admin-users";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  await requireSuperAdmin();
  return adminUserSecurity((await params).id);
});
