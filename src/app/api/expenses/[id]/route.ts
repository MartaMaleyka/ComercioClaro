import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { money } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { expenseSchema } from "@/lib/validation";

async function findExpense(businessId: string, id: string) {
  const expense = await prisma.expense.findFirst({ where: { id, businessId } });
  if (!expense) throw notFound("Gasto");
  return expense;
}

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await findExpense(auth.businessId, id);
  const input = await parseBody(request, expenseSchema);
  return prisma.expense.update({
    where: { id },
    data: {
      category: input.category,
      description: input.description,
      amount: money(input.amount),
      paymentMethod: input.paymentMethod,
      ...(input.date && { date: input.date }),
    },
  });
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const expense = await findExpense(auth.businessId, id);
  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id } });
    await audit(tx, auth, "expense.delete", "Expense", id, { amount: expense.amount.toNumber(), category: expense.category });
  });
  return { success: true };
});
