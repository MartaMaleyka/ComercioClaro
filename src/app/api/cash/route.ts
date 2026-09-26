import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cashSessionSummary, getOpenSession } from "@/server/cash";

/** Turno abierto (con resumen) y los últimos cortes. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  const open = await getOpenSession(prisma, auth.businessId);
  const [current, history] = await Promise.all([
    open ? cashSessionSummary(prisma, open.id) : null,
    auth.role === "OWNER"
      ? prisma.cashSession.findMany({
          where: { businessId: auth.businessId, closedAt: { not: null } },
          orderBy: { closedAt: "desc" },
          take: 30,
        })
      : [],
  ]);
  // El cajero no ve el efectivo esperado para no condicionar el conteo (corte a ciegas).
  if (current && auth.role !== "OWNER") {
    return { current: { session: current.session, movements: current.movements }, history };
  }
  return { current, history };
});
