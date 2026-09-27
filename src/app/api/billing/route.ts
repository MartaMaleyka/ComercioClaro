import { handler, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { billingUpdateSchema } from "@/lib/validation";
import { billingOverview, setAutoRenew } from "@/server/billing";

// requireSession: el dueño de un negocio suspendido por falta de pago también puede pagar.
export const GET = handler(async () => {
  const auth = await requireSession("OWNER");
  return billingOverview(auth.businessId);
});

export const PATCH = handler(async (request) => {
  const auth = await requireSession("OWNER");
  const { autoRenew } = await parseBody(request, billingUpdateSchema);
  return setAutoRenew(auth, autoRenew);
});
