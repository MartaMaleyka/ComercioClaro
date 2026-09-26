import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { getGiftCard } from "@/server/gift-cards";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "giftCards");
  return getGiftCard(auth.businessId, (await params).id);
});
