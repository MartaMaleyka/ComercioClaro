import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { cancelOpenOrder } from "@/server/open-orders";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "restaurant");
  await cancelOpenOrder(auth, (await params).id);
  return { ok: true };
});
