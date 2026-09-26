import { handler } from "@/lib/api";
import { requireSuperAdmin, startSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Sale del modo soporte: vuelve a su propio negocio (o al panel si no tiene). */
export const POST = handler(async () => {
  const admin = await requireSuperAdmin();
  const own = await prisma.membership.findFirst({ where: { userId: admin.id }, orderBy: { createdAt: "asc" } });
  await startSession({ sub: admin.id, bid: own?.businessId ?? "", tv: admin.tokenVersion });
  return { success: true };
});
