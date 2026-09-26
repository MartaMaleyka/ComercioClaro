import { z } from "zod";
import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { listOnlineOrders } from "@/server/online-orders";

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "catalog");
  const { scope } = parseQuery(
    request,
    z.object({ scope: z.enum(["active", "delivered", "cancelled"]).default("active") })
  );
  return listOnlineOrders(auth.businessId, scope);
});
