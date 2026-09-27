import type { z } from "zod";
import { Prisma, type BusinessStatus } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { countryConfig } from "@/lib/country";
import { accessState, parseOverrides, resolveFeatures } from "@/lib/features";
import type {
  adminBusinessSchema,
  adminListSchema,
  adminNewBusinessSchema,
  planSchema,
  subscriptionPaymentSchema,
} from "@/lib/validation";
import { temporaryPassword } from "./account";
import { limitUsage } from "./limits";

export type PlanInput = z.infer<typeof planSchema>;
export type AdminBusinessInput = Partial<z.infer<typeof adminBusinessSchema>>;
export type SubscriptionPaymentInput = z.infer<typeof subscriptionPaymentSchema>;
export type AdminListQuery = z.infer<typeof adminListSchema>;
export type AdminNewBusinessInput = z.infer<typeof adminNewBusinessSchema>;

interface Admin {
  id: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function adminAudit(
  db: Tx | typeof prisma,
  admin: Admin,
  action: string,
  entity: string,
  entityId: string | null,
  details?: Prisma.InputJsonValue
) {
  await db.adminAuditLog.create({ data: { action, entity, entityId, details, userId: admin.id } });
}

/** Ingreso mensual recurrente de un negocio según su plan y ciclo de cobro. */
function monthlyRevenue(business: {
  billingCycle: string;
  plan: { priceMonthly: Prisma.Decimal; priceYearly: Prisma.Decimal | null } | null;
}) {
  if (!business.plan) return D(0);
  if (business.billingCycle === "YEARLY" && business.plan.priceYearly) return D(business.plan.priceYearly).div(12);
  return D(business.plan.priceMonthly);
}

// ---------- Resumen ----------

export async function adminOverview(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [businesses, plans, payments, users, newBusinesses, sales30] = await Promise.all([
    prisma.business.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        trialEndsAt: true,
        paidUntil: true,
        suspendedReason: true,
        billingCycle: true,
        planId: true,
        plan: { select: { priceMonthly: true, priceYearly: true, currency: true } },
      },
    }),
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }] }),
    prisma.subscriptionPayment.findMany({
      where: { createdAt: { gte: yearAgo } },
      select: { amount: true, currency: true, createdAt: true },
    }),
    prisma.user.count(),
    prisma.business.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } }),
    prisma.$queryRaw<{ currency: string; count: bigint; total: Prisma.Decimal | null }[]>`
      SELECT b."currency" AS currency, COUNT(*) AS count, SUM(s."total") AS total
      FROM "Sale" s JOIN "Business" b ON b."id" = s."businessId"
      WHERE s."status" = 'ACTIVE' AND s."createdAt" >= ${new Date(now.getTime() - 30 * DAY_MS)}
      GROUP BY b."currency" ORDER BY 3 DESC`,
  ]);

  const byStatus = { ACTIVE: 0, TRIAL: 0, SUSPENDED: 0, OVERDUE: 0, TRIAL_ENDED: 0 };
  const mrr = new Map<string, Prisma.Decimal>();
  const trialsEnding: { id: string; name: string; trialEndsAt: Date }[] = [];
  const overdue: { id: string; name: string; paidUntil: Date }[] = [];
  for (const b of businesses) {
    byStatus[b.status]++;
    const access = accessState(b, now);
    if (access.blocked && access.reason === "trialEnded") byStatus.TRIAL_ENDED++;
    if (!access.blocked && access.warning?.kind === "overdue") {
      byStatus.OVERDUE++;
      overdue.push({ id: b.id, name: b.name, paidUntil: b.paidUntil! });
    }
    if (b.status === "TRIAL" && b.trialEndsAt && !access.blocked && b.trialEndsAt.getTime() - now.getTime() < 7 * DAY_MS) {
      trialsEnding.push({ id: b.id, name: b.name, trialEndsAt: b.trialEndsAt });
    }
    if (b.status === "ACTIVE" && b.plan) {
      mrr.set(b.plan.currency, (mrr.get(b.plan.currency) ?? D(0)).plus(monthlyRevenue(b)));
    }
  }

  // Cobrado por mes (últimos 12 meses, en UTC) y por moneda.
  const months: { month: string; amounts: Record<string, number> }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), amounts: {} });
  }
  for (const p of payments) {
    const row = months.find((m) => m.month === p.createdAt.toISOString().slice(0, 7));
    if (row) row.amounts[p.currency] = money(D(row.amounts[p.currency] ?? 0).plus(p.amount)).toNumber();
  }
  const byCurrency = (rows: { currency: string; amount: Prisma.Decimal }[]) => {
    const totals = new Map<string, Prisma.Decimal>();
    for (const r of rows) totals.set(r.currency, (totals.get(r.currency) ?? D(0)).plus(r.amount));
    return [...totals].map(([currency, amount]) => ({ currency, amount: money(amount).toNumber() }));
  };

  return {
    businesses: businesses.length,
    byStatus,
    mrr: [...mrr].map(([currency, amount]) => ({ currency, amount: money(amount).toNumber() })),
    collectedThisMonth: byCurrency(payments.filter((p) => p.createdAt >= monthStart)),
    collectedByMonth: months,
    byPlan: [
      ...plans.map((p) => ({
        id: p.id,
        name: p.name,
        count: businesses.filter((b) => b.planId === p.id).length,
      })),
      { id: null, name: null, count: businesses.filter((b) => !b.planId).length },
    ],
    users,
    newBusinesses,
    sales30: sales30.map((r) => ({
      currency: r.currency,
      count: Number(r.count),
      total: money(D(r.total)).toNumber(),
    })),
    trialsEnding: trialsEnding.sort((a, b) => a.trialEndsAt.getTime() - b.trialEndsAt.getTime()),
    overdue: overdue.sort((a, b) => a.paidUntil.getTime() - b.paidUntil.getTime()),
  };
}

// ---------- Negocios ----------

export async function adminListBusinesses(query: AdminListQuery) {
  const now = new Date();
  const where: Prisma.BusinessWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { memberships: { some: { user: { email: { contains: query.search, mode: "insensitive" } } } } },
      { memberships: { some: { user: { name: { contains: query.search, mode: "insensitive" } } } } },
    ];
  }
  if (query.status === "OVERDUE") {
    where.status = "ACTIVE";
    where.paidUntil = { lt: now };
  } else if (query.status) {
    where.status = query.status;
  }
  if (query.planId) where.planId = query.planId === "none" ? null : query.planId;

  const rows = await prisma.business.findMany({
    where,
    include: {
      plan: { select: { id: true, name: true, priceMonthly: true, priceYearly: true, currency: true } },
      memberships: {
        where: { role: "OWNER" },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      _count: { select: { memberships: true, products: true, sales: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    country: b.country,
    status: b.status,
    access: accessState(b, now),
    plan: b.plan,
    billingCycle: b.billingCycle,
    trialEndsAt: b.trialEndsAt,
    paidUntil: b.paidUntil,
    owners: b.memberships.map((m) => m.user),
    counts: b._count,
    createdAt: b.createdAt,
  }));
}

export async function adminBusinessDetail(id: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      plan: true,
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, disabledAt: true, isSuperAdmin: true } } },
        orderBy: { createdAt: "asc" },
      },
      subscriptionPayments: { orderBy: { createdAt: "desc" }, take: 50, include: { plan: { select: { name: true } } } },
      subscriptionCharges: { where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!business) throw notFound("Negocio");
  const owner = business.memberships.find((m) => m.role === "OWNER");
  const [usage, sales30, lastSale, audit] = await Promise.all([
    limitUsage(prisma, id, owner?.userId),
    prisma.sale.aggregate({
      where: { businessId: id, status: "ACTIVE", createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.sale.findFirst({ where: { businessId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.adminAuditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const admins = await prisma.user.findMany({
    where: { id: { in: [...new Set(audit.map((a) => a.userId))] } },
    select: { id: true, name: true },
  });
  return {
    id: business.id,
    name: business.name,
    country: business.country,
    currency: business.currency,
    address: business.address,
    phone: business.phone,
    createdAt: business.createdAt,
    status: business.status,
    access: accessState(business),
    plan: business.plan,
    billingCycle: business.billingCycle,
    trialEndsAt: business.trialEndsAt,
    paidUntil: business.paidUntil,
    suspendedReason: business.suspendedReason,
    adminNotes: business.adminNotes,
    featureOverrides: parseOverrides(business.featureOverrides),
    features: resolveFeatures(business),
    members: business.memberships.map((m) => ({ role: m.role, ...m.user })),
    payments: business.subscriptionPayments,
    billing: {
      autoRenew: business.autoRenew,
      card: business.billingCardLabel,
      failures: business.billingFailures,
      nextChargeAt: business.nextChargeAt,
      suspendedByBilling: business.suspendedByBilling,
      failedCharges: business.subscriptionCharges.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        amount: money(c.amount).toNumber(),
        currency: c.currency,
        error: c.error,
      })),
    },
    usage,
    sales30: { count: sales30._count, total: money(D(sales30._sum.total)).toNumber() },
    lastSaleAt: lastSale?.createdAt ?? null,
    audit: audit.map((a) => ({ ...a, userName: admins.find((u) => u.id === a.userId)?.name ?? null })),
  };
}

/** Cambia plan, estado, vigencia, funciones y notas del negocio. */
export async function adminUpdateBusiness(admin: Admin, id: string, input: AdminBusinessInput) {
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) throw notFound("Negocio");
  if (input.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw notFound("Plan");
  }
  const status = input.status ?? business.status;
  if (status === "SUSPENDED" && input.status === "SUSPENDED" && business.status !== "SUSPENDED" && !input.suspendedReason) {
    throw new AppError(400, "Indica el motivo de la suspensión");
  }
  const data: Prisma.BusinessUpdateInput = {};
  if (input.planId !== undefined) data.plan = input.planId ? { connect: { id: input.planId } } : { disconnect: true };
  if (input.status !== undefined) data.status = input.status;
  if (input.trialEndsAt !== undefined) data.trialEndsAt = input.trialEndsAt;
  if (input.paidUntil !== undefined) data.paidUntil = input.paidUntil;
  if (input.billingCycle !== undefined) data.billingCycle = input.billingCycle;
  if (input.suspendedReason !== undefined || input.status !== undefined) {
    data.suspendedReason = status === "SUSPENDED" ? (input.suspendedReason ?? business.suspendedReason) : null;
  }
  if (input.featureOverrides !== undefined) {
    const overrides = parseOverrides(input.featureOverrides ?? {});
    data.featureOverrides = Object.keys(overrides).length > 0 ? overrides : Prisma.DbNull;
  }
  if (input.adminNotes !== undefined) data.adminNotes = input.adminNotes;
  if (status === "TRIAL" && !(input.trialEndsAt ?? business.trialEndsAt)) {
    throw new AppError(400, "Indica hasta cuándo dura la prueba");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({ where: { id }, data });
    await adminAudit(tx, admin, "business.update", "Business", id, {
      fields: Object.keys(input),
      ...(input.status ? { status: input.status } : {}),
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
    });
    return updated;
  });
}

/**
 * Registra un pago de la suscripción: extiende la vigencia desde el vencimiento actual (o hoy,
 * si ya venció) por los meses pagados y activa el negocio.
 */
export async function adminRecordPayment(admin: Admin, businessId: string, input: SubscriptionPaymentInput) {
  return prisma.$transaction((tx) => recordSubscriptionPayment(tx, admin, businessId, input));
}

/**
 * Lo mismo dentro de una transacción; también lo usa el cobro en línea (con `planChange` cuando
 * el dueño paga otro plan o ciclo).
 */
export async function recordSubscriptionPayment(
  tx: Tx,
  admin: Admin,
  businessId: string,
  input: SubscriptionPaymentInput,
  planChange?: { planId: string; billingCycle: "MONTHLY" | "YEARLY" }
) {
  const business = await tx.business.findUnique({ where: { id: businessId }, include: { plan: true } });
  if (!business) throw notFound("Negocio");
  const plan = planChange ? await tx.plan.findUnique({ where: { id: planChange.planId } }) : business.plan;
  const now = new Date();
  const start =
    input.periodStart ?? (business.paidUntil && business.paidUntil > now ? business.paidUntil : now);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + input.months);

  const payment = await tx.subscriptionPayment.create({
    data: {
      businessId,
      planId: plan?.id ?? business.planId,
      amount: money(input.amount),
      currency: plan?.currency ?? "USD",
      method: input.method,
      reference: input.reference,
      periodStart: start,
      periodEnd: end,
      notes: input.notes,
      createdById: admin.id,
    },
  });
  const reactivate = business.status === "TRIAL" || (business.status === "SUSPENDED" && input.reactivate);
  await tx.business.update({
    where: { id: businessId },
    data: {
      paidUntil: end,
      // Pagado: se reinician los reintentos del cobro automático.
      billingFailures: 0,
      nextChargeAt: null,
      ...(planChange && plan ? { planId: plan.id, billingCycle: planChange.billingCycle } : {}),
      ...(reactivate
        ? { status: "ACTIVE" as BusinessStatus, suspendedReason: null, suspendedByBilling: false }
        : {}),
    },
  });
  await adminAudit(tx, admin, "payment.record", "Business", businessId, {
    amount: money(input.amount).toNumber(),
    months: input.months,
    paidUntil: end.toISOString(),
    ...(planChange ? { planId: planChange.planId, billingCycle: planChange.billingCycle } : {}),
  });
  return payment;
}

/** Da de alta un negocio con su dueño (contraseña temporal que debe cambiar al entrar). */
export async function adminCreateBusiness(admin: Admin, input: AdminNewBusinessInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  const plan = input.planId ? await prisma.plan.findUnique({ where: { id: input.planId } }) : null;
  if (input.planId && !plan) throw notFound("Plan");
  const country = countryConfig(input.country);
  const tempPassword = existing ? null : temporaryPassword();

  return prisma.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email: input.email,
          name: input.ownerName,
          passwordHash: await hashPassword(tempPassword!),
          mustChangePassword: true,
        },
      }));
    const business = await tx.business.create({
      data: {
        name: input.businessName,
        signupSource: "ADMIN",
        country: country.code,
        currency: country.currency,
        locale: country.locale,
        timezone: country.timezone,
        showBalboa: country.showBalboa,
        ...(plan
          ? plan.trialDays > 0
            ? { planId: plan.id, status: "TRIAL", trialEndsAt: new Date(Date.now() + plan.trialDays * DAY_MS) }
            : { planId: plan.id, status: "ACTIVE" }
          : {}),
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    await adminAudit(tx, admin, "business.create", "Business", business.id, {
      name: business.name,
      owner: input.email,
      newUser: !existing,
    });
    return { business, tempPassword, existingUser: Boolean(existing) };
  });
}

// ---------- Planes ----------

export async function adminListPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    include: { _count: { select: { businesses: true } } },
  });
  return plans;
}

/** Planes que se muestran en la página de precios. */
export async function publicPlans() {
  return prisma.plan.findMany({
    where: { active: true, isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
  });
}

async function unsetOtherDefaults(tx: Tx, planId: string) {
  await tx.plan.updateMany({ where: { isDefault: true, id: { not: planId } }, data: { isDefault: false } });
}

export async function adminCreatePlan(admin: Admin, input: PlanInput) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.create({ data: { ...input, features: [...new Set(input.features)] } });
    if (plan.isDefault) await unsetOtherDefaults(tx, plan.id);
    await adminAudit(tx, admin, "plan.create", "Plan", plan.id, { code: plan.code, name: plan.name });
    return plan;
  });
}

export async function adminUpdatePlan(admin: Admin, id: string, input: PlanInput) {
  const existing = await prisma.plan.findUnique({ where: { id } });
  if (!existing) throw notFound("Plan");
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.update({ where: { id }, data: { ...input, features: [...new Set(input.features)] } });
    if (plan.isDefault) await unsetOtherDefaults(tx, plan.id);
    await adminAudit(tx, admin, "plan.update", "Plan", id, {
      code: plan.code,
      price: D(plan.priceMonthly).toNumber(),
      previousPrice: D(existing.priceMonthly).toNumber(),
    });
    return plan;
  });
}

/** Un plan en uso no se borra: se desactiva para que no se ofrezca más. */
export async function adminDeletePlan(admin: Admin, id: string) {
  const plan = await prisma.plan.findUnique({ where: { id }, include: { _count: { select: { businesses: true } } } });
  if (!plan) throw notFound("Plan");
  if (plan._count.businesses > 0) {
    throw new AppError(409, `El plan tiene ${plan._count.businesses} negocio(s). Desactívalo o cámbialos de plan.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.plan.delete({ where: { id } });
    await adminAudit(tx, admin, "plan.delete", "Plan", id, { code: plan.code });
  });
}

// ---------- Usuarios ----------

export async function adminListUsers(search?: string) {
  const users = await prisma.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : {},
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
      disabledAt: true,
      createdAt: true,
      memberships: { select: { role: true, business: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return users;
}

export async function adminUpdateUser(admin: Admin, id: string, input: { isSuperAdmin?: boolean; disabled?: boolean }) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("Usuario");
  if (id === admin.id && (input.isSuperAdmin === false || input.disabled)) {
    throw new AppError(400, "No puedes quitarte el acceso a ti mismo");
  }
  if (input.isSuperAdmin === false && user.isSuperAdmin) {
    const admins = await prisma.user.count({ where: { isSuperAdmin: true, disabledAt: null } });
    if (admins <= 1) throw new AppError(400, "Debe quedar al menos un administrador de la plataforma");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(input.isSuperAdmin !== undefined ? { isSuperAdmin: input.isSuperAdmin } : {}),
        // Al bloquear se cierran todas sus sesiones.
        ...(input.disabled !== undefined
          ? { disabledAt: input.disabled ? new Date() : null, tokenVersion: { increment: 1 } }
          : {}),
      },
      select: { id: true, isSuperAdmin: true, disabledAt: true },
    });
    await adminAudit(tx, admin, "user.update", "User", id, { email: user.email, ...input });
    return updated;
  });
}

export async function adminRevokeSessions(admin: Admin, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("Usuario");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    await adminAudit(tx, admin, "user.revokeSessions", "User", id, { email: user.email });
  });
}

/** Contraseña temporal para un usuario que no puede entrar; debe cambiarla al iniciar sesión. */
export async function adminResetPassword(admin: Admin, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("Usuario");
  const tempPassword = temporaryPassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        tokenVersion: { increment: 1 },
      },
    });
    await adminAudit(tx, admin, "user.resetPassword", "User", id, { email: user.email });
  });
  return { tempPassword };
}

// ---------- Soporte y bitácora ----------

/** El super admin entra a un negocio como soporte; queda en ambas bitácoras. */
export async function adminEnterSupport(admin: Admin, businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw notFound("Negocio");
  await prisma.$transaction(async (tx) => {
    await adminAudit(tx, admin, "support.enter", "Business", businessId, { name: business.name });
    await tx.auditLog.create({
      data: {
        action: "support.enter",
        entity: "Business",
        entityId: businessId,
        details: { admin: admin.id },
        userId: admin.id,
        businessId,
      },
    });
  });
  return business;
}

export async function adminAuditLog(query: { cursor?: string | null; limit?: number }) {
  const limit = query.limit ?? 50;
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(items.map((r) => r.userId))] } },
    select: { id: true, name: true, email: true },
  });
  return {
    items: items.map((r) => ({ ...r, user: users.find((u) => u.id === r.userId) ?? null })),
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}
