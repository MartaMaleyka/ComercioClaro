import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { closePurchaseOrder } from "@/server/purchase-orders";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  return closePurchaseOrder(auth, (await params).id);
});
