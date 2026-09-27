import { created, handler, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { billingCheckoutSchema } from "@/lib/validation";
import { startCheckout } from "@/server/billing";

export const POST = handler(async (request) => {
  const auth = await requireSession("OWNER");
  await rateLimit(`billing-checkout:${auth.businessId}`, 30, 60 * 60);
  const input = await parseBody(request, billingCheckoutSchema);
  return created(await startCheckout({ ...auth, email: auth.user.email }, input));
});
