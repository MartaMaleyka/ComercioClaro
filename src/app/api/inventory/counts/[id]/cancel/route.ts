import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { cancelCount } from "@/server/counts";

export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await cancelCount(auth, id);
  return { success: true };
});
