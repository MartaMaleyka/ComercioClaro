import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getSale, receiptText } from "@/server/sales";
import { publicSale } from "@/server/views";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const sale = await getSale(auth.businessId, id);
  return { ...publicSale(sale, auth.role), receiptText: receiptText(sale, auth.business) };
});
