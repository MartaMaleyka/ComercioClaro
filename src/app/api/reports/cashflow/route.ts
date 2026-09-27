import { handler, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { cashflowQuerySchema } from "@/lib/validation";
import { cashflowProjection } from "@/server/cashflow";

/** Flujo de caja proyectado a 30, 60 o 90 días, semana a semana. */
export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  const { days, opening } = parseQuery(request, cashflowQuerySchema);
  return cashflowProjection(auth.business, { days, opening });
});
