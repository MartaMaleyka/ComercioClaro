import { z } from "zod";
import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { D } from "@/lib/decimal";
import { couponProblem, findCoupon } from "@/server/campaigns";

const querySchema = z.object({ code: z.string().trim().min(1).max(40), amount: z.coerce.number().min(0).default(0) });

/** Consulta un cupón desde el punto de venta (el descuento se aplica al cobrar). */
export const GET = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "campaigns");
  const { code, amount } = parseQuery(request, querySchema);
  const coupon = await findCoupon(auth.businessId, code);
  return {
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    minPurchase: coupon.minPurchase,
    problem: couponProblem(coupon, D(amount)),
  };
});
