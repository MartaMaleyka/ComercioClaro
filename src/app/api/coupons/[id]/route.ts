import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { couponSchema } from "@/lib/validation";
import { saveCoupon } from "@/server/campaigns";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  const { id } = await params;
  return saveCoupon(auth, await parseBody(request, couponSchema), id);
});
