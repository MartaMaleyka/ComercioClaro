import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelTransfer } from "@/server/transfers";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  return cancelTransfer(auth, (await params).id);
});
