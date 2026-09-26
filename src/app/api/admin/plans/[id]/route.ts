import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { planSchema } from "@/lib/validation";
import { adminDeletePlan, adminUpdatePlan } from "@/server/admin";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminUpdatePlan(admin, (await params).id, await parseBody(request, planSchema));
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  await adminDeletePlan(admin, (await params).id);
  return { success: true };
});
