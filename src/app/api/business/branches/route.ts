import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { branchSchema } from "@/lib/validation";
import { createBranch, listMemberships } from "@/server/account";

export const GET = handler(async () => {
  const auth = await requireAuth();
  const memberships = await listMemberships(auth.userId);
  return memberships.map((m) => ({ id: m.business.id, name: m.business.name, role: m.role, active: m.business.id === auth.businessId }));
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, branchSchema);
  return created(await createBranch(auth, input));
});
