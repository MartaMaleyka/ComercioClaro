import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { campaignSchema } from "@/lib/validation";
import { createCampaign, listCampaigns } from "@/server/campaigns";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  return listCampaigns(auth.businessId);
});

/** Crea la campaña con los clientes del segmento que aceptaron recibir promociones. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  const input = await parseBody(request, campaignSchema);
  return created(await createCampaign({ ...auth, timezone: auth.business.timezone }, input));
});
