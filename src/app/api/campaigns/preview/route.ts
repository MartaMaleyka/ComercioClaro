import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { segmentSchema } from "@/lib/validation";
import { previewSegment } from "@/server/campaigns";

/** Cuántos clientes del segmento recibirían la campaña. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "campaigns");
  return previewSegment(auth.business, await parseBody(request, segmentSchema));
});
