import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { cancelServiceSale } from "@/server/services";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  requireFeature(auth, "services");
  return cancelServiceSale(auth, (await params).id);
});
