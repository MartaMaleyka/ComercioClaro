import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { cancelYappyCharge } from "@/server/yappy";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "yappyApi");
  const { id } = await params;
  await cancelYappyCharge(auth.businessId, id);
  return { success: true };
});
