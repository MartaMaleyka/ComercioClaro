import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { voidGiftCard } from "@/server/gift-cards";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "giftCards");
  return voidGiftCard(auth, (await params).id);
});
