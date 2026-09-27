import { z } from "zod";
import { created, handler, parseBody, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { supplierBillSchema } from "@/lib/validation";
import { closedBills, createSupplierBill, payablesSummary } from "@/server/payables";

const querySchema = z.object({ history: z.enum(["true", "false"]).optional() });

/** Cuentas por pagar abiertas con su antigüedad; con history=true, las pagadas y canceladas. */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { history } = parseQuery(request, querySchema);
  if (history === "true") return { bills: await closedBills(auth.businessId) };
  return payablesSummary(auth.businessId, auth.business.timezone);
});

/** Registra a mano una factura de proveedor por pagar. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, supplierBillSchema);
  return created(await createSupplierBill(auth, input));
});
