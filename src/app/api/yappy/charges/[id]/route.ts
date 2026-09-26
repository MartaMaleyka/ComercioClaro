import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getYappyCharge } from "@/server/yappy";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  return getYappyCharge(auth.businessId, id);
});
