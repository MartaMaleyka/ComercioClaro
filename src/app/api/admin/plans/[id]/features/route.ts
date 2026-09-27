import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { planFeatureSchema } from "@/lib/validation";
import { adminSetPlanFeature } from "@/server/admin-features";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  const { feature, enabled } = await parseBody(request, planFeatureSchema);
  return adminSetPlanFeature(admin, (await params).id, feature, enabled);
});
