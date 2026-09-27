import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { recurringExpenseSchema } from "@/lib/validation";
import { createRecurringExpense, listRecurringExpenses } from "@/server/cashflow";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  return listRecurringExpenses(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  const input = await parseBody(request, recurringExpenseSchema);
  return created(await createRecurringExpense(auth, input));
});
