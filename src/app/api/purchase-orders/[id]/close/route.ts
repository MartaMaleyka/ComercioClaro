import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { closePurchaseOrder } from "@/server/purchase-orders";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "purchaseOrders");
  return closePurchaseOrder(auth, (await params).id);
});
