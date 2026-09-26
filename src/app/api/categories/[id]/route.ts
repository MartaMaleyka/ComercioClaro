import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validation";

async function findCategory(businessId: string, id: string) {
  const category = await prisma.category.findFirst({ where: { id, businessId } });
  if (!category) throw notFound("Categoría");
  return category;
}

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await findCategory(auth.businessId, id);
  const { name } = await parseBody(request, categorySchema);
  return prisma.category.update({ where: { id }, data: { name } });
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await findCategory(auth.businessId, id);
  // Los productos quedan sin categoría (onDelete: SetNull).
  await prisma.category.delete({ where: { id } });
  return { success: true };
});
