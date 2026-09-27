import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminResetMfa } from "@/server/admin-users";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminResetMfa(admin, (await params).id);
});
