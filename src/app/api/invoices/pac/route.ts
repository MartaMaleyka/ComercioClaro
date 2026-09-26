import { z } from "zod";
import { handler, parseBody, created } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { issueSaleInvoice } from "@/server/einvoice/service";

const schema = z.object({ saleId: z.string().min(1).max(64), customerId: z.string().max(64).nullish() });

/** Emite la factura electrónica de una venta con el PAC configurado (Panamá). */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "einvoice");
  const input = await parseBody(request, schema);
  return created(await issueSaleInvoice(auth, input.saleId, { customerId: input.customerId }));
});
