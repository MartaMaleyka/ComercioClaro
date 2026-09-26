import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { cashSessionSummary } from "@/server/cash";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const session = await prisma.cashSession.findFirst({ where: { id, businessId: auth.businessId } });
  if (!session) throw notFound("Turno de caja");
  return cashSessionSummary(prisma, id);
});
