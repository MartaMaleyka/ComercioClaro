import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminAuditLog } from "@/server/admin";

export const GET = handler(async (request) => {
  await requireSuperAdmin();
  const cursor = request.nextUrl.searchParams.get("cursor");
  return adminAuditLog({ cursor, limit: 50 });
});
