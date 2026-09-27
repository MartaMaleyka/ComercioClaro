import { handler, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PAYROLL_DEFAULTS, payrollSettings } from "@/lib/payroll";
import { payrollSettingsSchema } from "@/lib/validation";
import { requirePayroll } from "../auth";

/** Parámetros de planilla del negocio y los valores por defecto. */
export const GET = handler(async () => {
  const auth = await requirePayroll();
  return { settings: payrollSettings(auth.business.payrollSettings), defaults: PAYROLL_DEFAULTS };
});

export const PUT = handler(async (request) => {
  const auth = await requirePayroll();
  const input = await parseBody(request, payrollSettingsSchema);
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: auth.businessId }, data: { payrollSettings: input } });
    await audit(tx, auth, "payroll.settings", "Business", auth.businessId, input);
  });
  return { settings: payrollSettings(input), defaults: PAYROLL_DEFAULTS };
});
