import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { billInclude } from "@/server/payables";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const bill = await prisma.supplierBill.findFirst({
    where: { id, businessId: auth.businessId },
    include: billInclude,
  });
  if (!bill) throw notFound("Cuenta por pagar");
  return bill;
});
