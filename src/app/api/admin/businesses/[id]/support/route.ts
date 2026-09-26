import { handler } from "@/lib/api";
import { requireSuperAdmin, startSession } from "@/lib/auth";
import { adminEnterSupport } from "@/server/admin";

/** Entra al negocio como soporte: la sesión cambia a ese negocio con permisos de dueño. */
export const POST = handler<{ id: string }>(async (_request, { params }) => {
  const admin = await requireSuperAdmin();
  const business = await adminEnterSupport(admin, (await params).id);
  await startSession({ sub: admin.id, bid: business.id, tv: admin.tokenVersion });
  return { success: true };
});
