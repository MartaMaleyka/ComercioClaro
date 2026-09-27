import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminCloseBusinessSchema } from "@/lib/validation";
import { adminCloseBusiness } from "@/server/admin-businesses";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminCloseBusiness(admin, (await params).id, await parseBody(request, adminCloseBusinessSchema));
});
