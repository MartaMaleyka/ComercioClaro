import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminReopenBusiness } from "@/server/admin-businesses";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminReopenBusiness(admin, (await params).id);
});
