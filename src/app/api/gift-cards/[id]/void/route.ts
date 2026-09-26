import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { voidGiftCard } from "@/server/gift-cards";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  return voidGiftCard(auth, (await params).id);
});
