import { handler } from "@/lib/api";
import { payPayrollContributions } from "@/server/payroll";
import { requirePayroll } from "../../../auth";

/** Registra el pago de las cuotas a la CSS y del ISR retenido de la planilla. */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  return payPayrollContributions(auth, id);
});
