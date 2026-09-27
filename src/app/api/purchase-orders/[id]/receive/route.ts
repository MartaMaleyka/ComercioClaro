import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { purchaseOrderReceiveSchema } from "@/lib/validation";
import { receivePurchaseOrder } from "@/server/purchase-orders";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "purchaseOrders");
  const input = await parseBody(request, purchaseOrderReceiveSchema);
  if (input.onCredit) requireFeature(auth, "payables");
  return receivePurchaseOrder(auth, (await params).id, input);
});
