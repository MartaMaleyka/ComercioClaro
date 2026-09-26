import { created, handler, parseBody, parseQuery } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminListSchema, adminNewBusinessSchema } from "@/lib/validation";
import { adminCreateBusiness, adminListBusinesses } from "@/server/admin";

export const GET = handler(async (request) => {
  await requireSuperAdmin();
  return adminListBusinesses(parseQuery(request, adminListSchema));
});

export const POST = handler(async (request) => {
  const admin = await requireSuperAdmin();
  const input = await parseBody(request, adminNewBusinessSchema);
  return created(await adminCreateBusiness(admin, input));
});
