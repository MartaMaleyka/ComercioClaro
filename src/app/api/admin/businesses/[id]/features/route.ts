import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { businessFeatureSchema } from "@/lib/validation";
import { adminSetBusinessFeature } from "@/server/admin-features";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  const { feature, mode } = await parseBody(request, businessFeatureSchema);
  return adminSetBusinessFeature(admin, (await params).id, feature, mode);
});
