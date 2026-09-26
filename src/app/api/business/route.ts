import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { businessSchema } from "@/lib/validation";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return auth.business;
});

export const PUT = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { userName, ...data } = await parseBody(request, businessSchema);

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.update({ where: { id: auth.businessId }, data });
    const user = userName
      ? await tx.user.update({ where: { id: auth.userId }, data: { name: userName } })
      : null;
    await audit(tx, auth, "business.update", "Business", auth.businessId, { fields: Object.keys(data) });
    return {
      business,
      user: user ? { id: user.id, email: user.email, name: user.name } : auth.user,
    };
  });
});
