import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { ownerTransactionSchema } from "@/lib/validation";
import { createOwnerTransaction, listOwnerTransactions } from "@/server/accounting";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  return listOwnerTransactions(auth.businessId);
});

/** Aporte o retiro del dueño. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "accounting");
  return created(await createOwnerTransaction(auth, await parseBody(request, ownerTransactionSchema)));
});
