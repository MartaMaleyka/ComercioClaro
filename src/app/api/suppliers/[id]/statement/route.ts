import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { supplierStatement } from "@/server/payables";

/** Estado de cuenta del proveedor: facturas, abonos y saldo. */
export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  return supplierStatement(auth.businessId, id, auth.business.timezone);
});
