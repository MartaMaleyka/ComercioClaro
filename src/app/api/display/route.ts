import { z } from "zod";
import { handler, parseBody, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayStateSchema } from "@/lib/display";

const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Estado más reciente de la pantalla del cliente (de un cajero o del último que vendió). */
export const GET = handler(async (request) => {
  const auth = await requireAuth();
  const { userId } = parseQuery(request, z.object({ userId: z.string().max(64).optional() }));
  const row = await prisma.customerDisplay.findFirst({
    where: {
      businessId: auth.businessId,
      updatedAt: { gte: new Date(Date.now() - MAX_AGE_MS) },
      ...(userId ? { userId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return row ? { state: row.state, userId: row.userId } : null;
});

/** El punto de venta publica lo que ve el cliente. */
export const PUT = handler(async (request) => {
  const auth = await requireAuth();
  const state = await parseBody(request, displayStateSchema);
  await prisma.customerDisplay.upsert({
    where: { businessId_userId: { businessId: auth.businessId, userId: auth.userId } },
    create: { businessId: auth.businessId, userId: auth.userId, state },
    update: { state },
  });
  return { ok: true };
});
