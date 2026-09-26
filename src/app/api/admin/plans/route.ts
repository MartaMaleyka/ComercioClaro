import { created, handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { planSchema } from "@/lib/validation";
import { adminCreatePlan, adminListPlans } from "@/server/admin";

export const GET = handler(async () => {
  await requireSuperAdmin();
  return adminListPlans();
});

export const POST = handler(async (request) => {
  const admin = await requireSuperAdmin();
  return created(await adminCreatePlan(admin, await parseBody(request, planSchema)));
});
