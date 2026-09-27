import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelSchema } from "@/lib/validation";
import { cancelSupplierBill } from "@/server/payables";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const { reason } = await parseBody(request, cancelSchema);
  return cancelSupplierBill(auth, id, reason);
});
