import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { memberSchema } from "@/lib/validation";
import { addMember } from "@/server/account";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return prisma.membership.findMany({
    where: { businessId: auth.businessId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, memberSchema);
  return created(await addMember(auth, input));
});
