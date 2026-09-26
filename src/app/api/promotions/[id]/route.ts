import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { promotionSchema } from "@/lib/validation";

async function find(businessId: string, id: string) {
  const promotion = await prisma.promotion.findFirst({ where: { id, businessId } });
  if (!promotion) throw notFound("Promoción");
  return promotion;
}

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "promotions");
  const { id } = await params;
  await find(auth.businessId, id);
  const input = await parseBody(request, promotionSchema);
  return prisma.promotion.update({ where: { id }, data: input });
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "promotions");
  const { id } = await params;
  await find(auth.businessId, id);
  await prisma.promotion.delete({ where: { id } });
  return { success: true };
});
