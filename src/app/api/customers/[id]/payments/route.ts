import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { customerPaymentSchema } from "@/lib/validation";
import { addCustomerPayment } from "@/server/customers";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const input = await parseBody(request, customerPaymentSchema);
  return created(await addCustomerPayment(auth, id, input));
});
