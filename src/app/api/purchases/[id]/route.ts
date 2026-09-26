import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { purchaseInclude } from "@/server/purchases";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const purchase = await prisma.purchase.findFirst({ where: { id, businessId: auth.businessId }, include: purchaseInclude });
  if (!purchase) throw notFound("Compra");
  return purchase;
});
