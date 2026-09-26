import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminUserSchema } from "@/lib/validation";
import { adminUpdateUser } from "@/server/admin";

export const PATCH = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminUpdateUser(admin, (await params).id, await parseBody(request, adminUserSchema));
});
