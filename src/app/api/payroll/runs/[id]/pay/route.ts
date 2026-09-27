import { handler, parseBody } from "@/lib/api";
import { payPayrollSchema } from "@/lib/validation";
import { payPayrollRun } from "@/server/payroll";
import { requirePayroll } from "../../../auth";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  const { method } = await parseBody(request, payPayrollSchema);
  return payPayrollRun(auth, id, method);
});
