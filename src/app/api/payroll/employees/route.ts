import { created, handler, parseBody } from "@/lib/api";
import { employeeSchema } from "@/lib/validation";
import { createEmployee, listEmployees } from "@/server/payroll";
import { requirePayroll } from "../auth";

export const GET = handler(async () => {
  const auth = await requirePayroll();
  return listEmployees(auth.businessId);
});

export const POST = handler(async (request) => {
  const auth = await requirePayroll();
  return created(await createEmployee(auth, await parseBody(request, employeeSchema)));
});
