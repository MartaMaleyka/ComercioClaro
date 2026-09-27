import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { campaignDetail } from "@/server/campaigns";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  const { id } = await params;
  return campaignDetail(auth.businessId, id);
});
