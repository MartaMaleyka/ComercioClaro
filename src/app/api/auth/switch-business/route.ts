import { handler, parseBody } from "@/lib/api";
import { requireAuth, startSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { switchBusinessSchema } from "@/lib/validation";

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const { businessId } = await parseBody(request, switchBusinessSchema);
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: auth.userId, businessId } },
    include: { user: true },
  });
  if (!membership) throw new AppError(403, "No tienes acceso a esa sucursal");
  await startSession({ sub: auth.userId, bid: businessId, tv: membership.user.tokenVersion });
  return { success: true, role: membership.role };
});
