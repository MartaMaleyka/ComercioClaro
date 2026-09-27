import { handler, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { simulatedPaymentSchema } from "@/lib/validation";
import { completeSimulatedCheckout, simulatedCheckoutDetail } from "@/server/billing";

/** Checkout simulado (BILLING_PROVIDER=simulado): hace las veces de la página de pago y del webhook. */
export const GET = handler(async (request) => {
  const auth = await requireSession("OWNER");
  const id = request.nextUrl.searchParams.get("cargo");
  if (!id) throw new AppError(400, "Falta el cobro");
  return simulatedCheckoutDetail(auth.businessId, id);
});

export const POST = handler(async (request) => {
  const auth = await requireSession("OWNER");
  const { chargeId, card } = await parseBody(request, simulatedPaymentSchema);
  return completeSimulatedCheckout(auth, chargeId, card);
});
