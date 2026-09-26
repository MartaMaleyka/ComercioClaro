import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { applyCount } from "@/server/counts";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "inventoryCounts");
  const { id } = await params;
  return applyCount(auth, id);
});
