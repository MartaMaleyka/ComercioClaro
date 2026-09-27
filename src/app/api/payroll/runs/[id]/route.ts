import { handler } from "@/lib/api";
import { deletePayrollRun, getPayrollRun } from "@/server/payroll";
import { requirePayroll } from "../../auth";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  return getPayrollRun(auth.businessId, id);
});

/** Borra una planilla en borrador. */
export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requirePayroll();
  const { id } = await params;
  await deletePayrollRun(auth, id);
  return { success: true };
});
