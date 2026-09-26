import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminListUsers } from "@/server/admin";

export const GET = handler(async (request) => {
  await requireSuperAdmin();
  const search = request.nextUrl.searchParams.get("search")?.trim().slice(0, 100) || undefined;
  return adminListUsers(search);
});
