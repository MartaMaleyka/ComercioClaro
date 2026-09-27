import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelSchema } from "@/lib/validation";
import { voidSupplierPayment } from "@/server/payables";

/** Anula un abono a proveedor: el saldo vuelve a la factura. */
export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const { reason } = await parseBody(request, cancelSchema);
  return voidSupplierPayment(auth, id, reason);
});
