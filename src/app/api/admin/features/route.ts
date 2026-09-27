import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminFeatureMatrix } from "@/server/admin-features";

export const GET = handler(async () => {
  await requireSuperAdmin();
  return adminFeatureMatrix();
});
