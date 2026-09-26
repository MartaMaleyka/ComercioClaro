import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelSchema } from "@/lib/validation";
import { cancelSale } from "@/server/sales";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const { reason } = await parseBody(request, cancelSchema);
  return cancelSale(auth, id, reason);
});
