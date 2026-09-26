import { handler, parseBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { languageSchema } from "@/lib/validation";
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

/** Cambia el idioma de la interfaz del usuario. */
export const PUT = handler(async (request) => {
  const auth = await requireAuth();
  const { language } = await parseBody(request, languageSchema);
  await prisma.user.update({ where: { id: auth.userId }, data: { language } });
  return { language };
});
