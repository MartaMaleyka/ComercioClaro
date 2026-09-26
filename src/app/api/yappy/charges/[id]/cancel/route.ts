import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelYappyCharge } from "@/server/yappy";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  await cancelYappyCharge(auth.businessId, id);
  return { success: true };
});
