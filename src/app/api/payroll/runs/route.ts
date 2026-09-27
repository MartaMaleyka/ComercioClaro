import { created, handler, parseBody } from "@/lib/api";
import { payrollRunSchema } from "@/lib/validation";
import { createPayrollRun, listPayrollRuns } from "@/server/payroll";
import { requirePayroll } from "../auth";

export const GET = handler(async () => {
  const auth = await requirePayroll();
  return listPayrollRuns(auth.businessId);
});

/** Crea la planilla del periodo (quincena o mes) que contiene la fecha. */
export const POST = handler(async (request) => {
  const auth = await requirePayroll();
  return created(await createPayrollRun(auth, await parseBody(request, payrollRunSchema)));
});
