import { z } from "zod";
import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { supplierSchema } from "@/lib/validation";

const querySchema = z.object({ search: z.string().trim().max(100).optional() });

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { search } = parseQuery(request, querySchema);
  return prisma.supplier.findMany({
    where: {
      businessId: auth.businessId,
      archivedAt: null,
      ...(search && { name: { contains: search, mode: "insensitive" as const } }),
    },
    include: { _count: { select: { purchases: { where: { status: "ACTIVE" } } } } },
    orderBy: { name: "asc" },
  });
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, supplierSchema);
  return created(
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: { ...input, businessId: auth.businessId } });
      await audit(tx, auth, "supplier.create", "Supplier", supplier.id, { name: supplier.name });
      return supplier;
    })
  );
});
