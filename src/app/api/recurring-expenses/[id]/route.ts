import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { recurringExpenseSchema } from "@/lib/validation";
import { deleteRecurringExpense, updateRecurringExpense } from "@/server/cashflow";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  const { id } = await params;
  return updateRecurringExpense(auth, id, await parseBody(request, recurringExpenseSchema));
});

/** Borra el gasto recurrente; los gastos que ya generó se conservan. */
export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  const { id } = await params;
  await deleteRecurringExpense(auth, id);
  return { success: true };
});
