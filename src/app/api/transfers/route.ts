import { created, handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { transferSchema } from "@/lib/validation";
import { createTransfer, listTransfers } from "@/server/transfers";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return listTransfers(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  return created(await createTransfer(auth, await parseBody(request, transferSchema)));
});
