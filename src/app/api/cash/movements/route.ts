import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cashMovementSchema } from "@/lib/validation";
import { addCashMovement } from "@/server/cash";

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, cashMovementSchema);
  return created(await addCashMovement(auth, input));
});
