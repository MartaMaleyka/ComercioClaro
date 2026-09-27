import { handler, parseBody } from "@/lib/api";
import { payrollLineSchema } from "@/lib/validation";
import { updatePayrollLine } from "@/server/payroll";
import { requirePayroll } from "../../auth";

/** Horas extra y otros descuentos de un renglón (planilla en borrador). */
export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  return updatePayrollLine(auth, id, await parseBody(request, payrollLineSchema));
});
