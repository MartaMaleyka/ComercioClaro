import type { Prisma } from "@/generated/prisma/client";
import { handler, parseBody, parseQuery, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { money } from "@/lib/decimal";
import { dayRange } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { expenseSchema, listQuerySchema } from "@/lib/validation";
import { getOpenSession } from "@/server/cash";

export const GET = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const query = parseQuery(request, listQuerySchema);
  const where: Prisma.ExpenseWhereInput = { businessId: auth.businessId };
  if (query.from || query.to) {
    const range = dayRange(query.from ?? "2000-01-01", query.to ?? "2999-12-31", auth.business.timezone);
    where.date = { gte: range.start, lt: range.end };
  }
  if (query.search) {
    where.OR = [
      { category: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const categories = await prisma.expense.findMany({
    where: { businessId: auth.businessId },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null, categories: categories.map((c) => c.category) };
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, expenseSchema);
  if (input.date && input.date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new AppError(400, "La fecha del gasto no puede ser futura");
  }
  return created(
    await prisma.$transaction(async (tx) => {
      const cashSession = input.paymentMethod === "CASH" ? await getOpenSession(tx, auth.businessId) : null;
      const expense = await tx.expense.create({
        data: {
          category: input.category,
          description: input.description,
          amount: money(input.amount),
          paymentMethod: input.paymentMethod,
          date: input.date ?? new Date(),
          cashSessionId: cashSession?.id ?? null,
          userId: auth.userId,
          businessId: auth.businessId,
        },
      });
      await audit(tx, auth, "expense.create", "Expense", expense.id, { amount: input.amount, category: input.category });
      return expense;
    })
  );
});
