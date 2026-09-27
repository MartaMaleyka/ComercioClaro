import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { sendCampaign } from "@/server/campaigns";

/** Envía los mensajes pendientes por la API de WhatsApp Business (si está configurada). */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  const { id } = await params;
  return sendCampaign({ ...auth, country: auth.business.country }, id);
});
