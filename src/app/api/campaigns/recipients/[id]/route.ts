import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { markRecipientSent } from "@/server/campaigns";

/** Envío asistido: el dueño abrió el enlace de WhatsApp y marca el mensaje como enviado. */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  const { id } = await params;
  await markRecipientSent(auth, id);
  return { success: true };
});
