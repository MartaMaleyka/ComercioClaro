import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { markPurchaseOrderSent } from "@/server/purchase-orders";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  return markPurchaseOrderSent(auth, (await params).id);
});
