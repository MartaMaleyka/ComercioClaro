import { handler, parseBody } from "@/lib/api";
import { employeeSchema } from "@/lib/validation";
import { updateEmployee } from "@/server/payroll";
import { requirePayroll } from "../../auth";

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  return updateEmployee(auth, id, await parseBody(request, employeeSchema));
});
