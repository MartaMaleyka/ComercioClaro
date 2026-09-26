import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { retryPendingInvoices } from "@/server/einvoice/service";

/** Reintenta ya las facturas pendientes por contingencia. */
export const POST = handler(async () => {
  const auth = await requireAuth("OWNER");
  return retryPendingInvoices(auth.businessId, true);
});
