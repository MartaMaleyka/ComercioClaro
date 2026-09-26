import { created, handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { subscriptionPaymentSchema } from "@/lib/validation";
import { adminRecordPayment } from "@/server/admin";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const admin = await requireSuperAdmin();
  const input = await parseBody(request, subscriptionPaymentSchema);
  return created(await adminRecordPayment(admin, (await params).id, input));
});
