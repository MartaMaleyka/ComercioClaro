import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminOverview } from "@/server/admin";

export const GET = handler(async () => {
  await requireSuperAdmin();
  return adminOverview();
});
