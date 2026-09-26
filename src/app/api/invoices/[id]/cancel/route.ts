import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelInvoice } from "@/server/invoices";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  return cancelInvoice(auth, id);
});
