import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { externalInvoiceSchema } from "@/lib/validation";
import { registerExternalInvoice } from "@/server/dgi";

/** Registra el CUFE de una factura emitida en el facturador de la DGI o en un PAC. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, externalInvoiceSchema);
  return created(await registerExternalInvoice(auth, input));
});
