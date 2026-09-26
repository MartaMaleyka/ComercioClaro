import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { listMemberships } from "@/server/account";

export const GET = handler(async () => {
  const auth = await requireAuth();
  const memberships = await listMemberships(auth.userId);
  return {
    user: auth.user,
    role: auth.role,
    business: auth.business,
    businesses: memberships.map((m) => ({ id: m.business.id, name: m.business.name, role: m.role })),
  };
});
