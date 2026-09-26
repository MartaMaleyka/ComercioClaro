import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cashOpenSchema } from "@/lib/validation";
import { openCashSession } from "@/server/cash";

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, cashOpenSchema);
  return created(await openCashSession(auth, input));
});
