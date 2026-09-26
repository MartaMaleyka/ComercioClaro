import { z } from "zod";
import { created, handler, parseBody, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { purchaseOrderSchema } from "@/lib/validation";
import { createPurchaseOrder, listPurchaseOrders } from "@/server/purchase-orders";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "purchaseOrders");
  const { scope } = parseQuery(request, z.object({ scope: z.enum(["open", "closed"]).default("open") }));
  return listPurchaseOrders(auth.businessId, scope);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "purchaseOrders");
  return created(await createPurchaseOrder(auth, await parseBody(request, purchaseOrderSchema)));
});
