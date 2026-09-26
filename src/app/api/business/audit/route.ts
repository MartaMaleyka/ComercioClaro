import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listQuerySchema } from "@/lib/validation";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, listQuerySchema);
  const rows = await prisma.auditLog.findMany({
    where: { businessId: auth.businessId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const hasMore = rows.length > query.limit;
  const items = (hasMore ? rows.slice(0, query.limit) : rows).map((r) => ({
    ...r,
    userName: r.userId ? (names.get(r.userId) ?? null) : null,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});
