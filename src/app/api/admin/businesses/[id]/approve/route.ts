import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminApproveBusiness } from "@/server/admin-businesses";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminApproveBusiness(admin, (await params).id);
});
