import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { customerSchema } from "@/lib/validation";
import { customersAging } from "@/server/customers";

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  withBalance: z.enum(["true", "false"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
});

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  const q = parseQuery(request, querySchema);
  const where: Prisma.CustomerWhereInput = { businessId: auth.businessId, archivedAt: null };
  if (q.withBalance === "true" || q.overdue === "true") where.balance = { gt: 0 };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { phone: { contains: q.search } },
    ];
  }
  const customers = await prisma.customer.findMany({ where, orderBy: [{ balance: "desc" }, { name: "asc" }], take: 500 });
  const aging = await customersAging(
    auth.businessId,
    customers.filter((c) => c.balance.gt(0)).map((c) => c.id)
  );
  const list = customers.map((c) => {
    const a = aging.get(c.id);
    return { ...c, overdue: a?.overdue ?? 0, daysOverdue: a?.daysOverdue ?? 0, nextDueDate: a?.nextDueDate ?? null };
  });
  return q.overdue === "true" ? list.filter((c) => c.overdue > 0) : list;
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  const input = await parseBody(request, customerSchema);
  // Los cajeros pueden registrar clientes, pero solo el dueño fija el límite de crédito.
  const data = auth.role === "OWNER" ? input : { ...input, creditLimit: 0 };
  return created(
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: { ...data, businessId: auth.businessId } });
      await audit(tx, auth, "customer.create", "Customer", customer.id, { name: customer.name });
      return customer;
    })
  );
});
