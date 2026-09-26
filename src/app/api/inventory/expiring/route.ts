import { z } from "zod";
import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  const { days } = parseQuery(request, querySchema);
  const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return prisma.productBatch.findMany({
    where: { businessId: auth.businessId, remaining: { gt: 0 }, expiresAt: { not: null, lte: limit } },
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { expiresAt: "asc" },
  });
});
