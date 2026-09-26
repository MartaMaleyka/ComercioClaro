import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validation";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return prisma.category.findMany({
    where: { businessId: auth.businessId },
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
    orderBy: { name: "asc" },
  });
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { name } = await parseBody(request, categorySchema);
  return created(await prisma.category.create({ data: { name, businessId: auth.businessId } }));
});
