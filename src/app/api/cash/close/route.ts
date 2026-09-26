import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cashCloseSchema } from "@/lib/validation";
import { closeCashSession } from "@/server/cash";

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, cashCloseSchema);
  const result = await closeCashSession(auth, input);
  if (auth.role !== "OWNER") {
    return { session: { id: result.session.id, closedAt: result.session.closedAt, countedAmount: result.session.countedAmount } };
  }
  return result;
});
