import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { saleReturnSchema } from "@/lib/validation";
import { returnSale } from "@/server/sales";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const input = await parseBody(request, saleReturnSchema);
  return created(await returnSale(auth, id, input));
});
