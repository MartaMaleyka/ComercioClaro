import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminRevokeSessions } from "@/server/admin";

/** Cierra todas las sesiones del usuario. */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  await adminRevokeSessions(admin, (await params).id);
  return { success: true };
});
