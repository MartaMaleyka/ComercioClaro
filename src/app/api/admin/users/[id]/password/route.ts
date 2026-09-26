import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { adminResetPassword } from "@/server/admin";

/** Genera una contraseña temporal (se muestra una sola vez). */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  return adminResetPassword(admin, (await params).id);
});
