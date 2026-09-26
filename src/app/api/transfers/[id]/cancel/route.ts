import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { cancelTransfer } from "@/server/transfers";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "branches");
  return cancelTransfer(auth, (await params).id);
});
