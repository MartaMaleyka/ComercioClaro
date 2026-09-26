import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { removeMember } from "@/server/account";

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await removeMember(auth, id);
  return { success: true };
});
