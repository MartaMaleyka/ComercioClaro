import { created, handler, parseBody } from "@/lib/api";
import { salaryAdvanceSchema } from "@/lib/validation";
import { createAdvance } from "@/server/payroll";
import { requirePayroll } from "../auth";

/** Adelanto de sueldo: se descuenta en la siguiente planilla. */
export const POST = handler(async (request) => {
  const auth = await requirePayroll();
  return created(await createAdvance(auth, await parseBody(request, salaryAdvanceSchema)));
});
