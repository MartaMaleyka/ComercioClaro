import { requireAuth, requireFeature } from "@/lib/auth";

/** Dueño con la función de planilla en su plan. */
export async function requirePayroll() {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "payroll");
  return auth;
}
