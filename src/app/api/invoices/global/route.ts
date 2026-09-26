import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { globalInvoiceSchema } from "@/lib/validation";
import { invoiceGlobal } from "@/server/invoices";

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, globalInvoiceSchema);
  return created(await invoiceGlobal(auth, input));
});
