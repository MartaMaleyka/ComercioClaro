import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { kitchenStatusSchema } from "@/lib/validation";
import { setKitchenStatus } from "@/server/open-orders";

export const PATCH = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth();
  const { status } = await parseBody(request, kitchenStatusSchema);
  return setKitchenStatus(auth, (await params).id, status);
});
