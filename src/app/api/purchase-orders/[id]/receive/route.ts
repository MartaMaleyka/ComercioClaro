import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { purchaseOrderReceiveSchema } from "@/lib/validation";
import { receivePurchaseOrder } from "@/server/purchase-orders";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  return receivePurchaseOrder(auth, (await params).id, await parseBody(request, purchaseOrderReceiveSchema));
});
