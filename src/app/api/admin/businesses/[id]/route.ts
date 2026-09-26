import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminBusinessSchema } from "@/lib/validation";
import { adminBusinessDetail, adminUpdateBusiness } from "@/server/admin";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  await requireSuperAdmin();
  return adminBusinessDetail((await params).id);
});

export const PATCH = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  const { id } = await params;
  await adminUpdateBusiness(admin, id, await parseBody(request, adminBusinessSchema));
  return adminBusinessDetail(id);
});
