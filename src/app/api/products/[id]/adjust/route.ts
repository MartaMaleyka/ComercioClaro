import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { stockAdjustmentSchema } from "@/lib/validation";
import { adjustStock } from "@/server/inventory";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const input = await parseBody(request, stockAdjustmentSchema);
  return adjustStock(auth, id, input);
});
