import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { customerSchema } from "@/lib/validation";
import { consentFields, customerStatement } from "@/server/customers";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  return customerStatement(auth.businessId, id);
});

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, businessId: auth.businessId } });
  if (!existing) throw notFound("Cliente");
  const input = await parseBody(request, customerSchema);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id },
      data: { ...input, ...consentFields(input.marketingConsent, existing) },
    });
    await audit(tx, auth, "customer.update", "Customer", id, { creditLimit: input.creditLimit });
    return customer;
  });
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, businessId: auth.businessId } });
  if (!existing) throw notFound("Cliente");
  if (existing.balance.gt(0)) throw new AppError(409, "El cliente tiene saldo pendiente");
  await prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
  return { success: true };
});
