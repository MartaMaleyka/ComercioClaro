import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminEmailSchema } from "@/lib/validation";
import { adminChangeEmail } from "@/server/admin-users";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  const { email } = await parseBody(request, adminEmailSchema);
  return adminChangeEmail(admin, (await params).id, email);
});
