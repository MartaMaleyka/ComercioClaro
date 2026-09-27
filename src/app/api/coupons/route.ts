import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { couponSchema } from "@/lib/validation";
import { listCoupons, saveCoupon } from "@/server/campaigns";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  return listCoupons(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  return created(await saveCoupon(auth, await parseBody(request, couponSchema)));
});
