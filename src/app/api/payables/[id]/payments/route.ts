import { created, handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { supplierPaymentSchema } from "@/lib/validation";
import { paySupplierBill } from "@/server/payables";

/** Abono a la factura: en efectivo de la caja o por banco (transferencia, tarjeta, Yappy). */
export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const input = await parseBody(request, supplierPaymentSchema);
  return created(await paySupplierBill(auth, id, input));
});
