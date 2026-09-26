import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { PAC_PROVIDERS } from "@/server/einvoice/providers";

/** PAC disponibles y si tienen credenciales en el servidor. */
export const GET = handler(async () => {
  await requireAuth("OWNER");
  return Object.values(PAC_PROVIDERS).map((p) => ({ id: p.id, name: p.name, configured: p.isConfigured() }));
});
