import { Prisma } from "@/generated/prisma/client";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  FEATURE_KEYS,
  isFeatureKey,
  parseOverrides,
  resolveFeatures,
  type FeatureKey,
  type FeatureOverrides,
} from "@/lib/features";
import { adminAudit } from "./admin";

/**
 * Funciones en el panel del super admin: qué incluye cada plan, cuántos negocios tienen cada
 * función y los ajustes a mano por negocio.
 */

interface Admin {
  id: string;
}

export type FeatureMode = "plan" | "on" | "off";

export interface FeatureUsage {
  /** Negocios que la tienen activa (por su plan o por un ajuste) */
  active: number;
  /** Negocios con un ajuste a mano */
  forcedOn: number;
  forcedOff: number;
}

export async function adminFeatureMatrix() {
  const [plans, businesses] = await Promise.all([
    prisma.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
      include: { _count: { select: { businesses: true } } },
    }),
    prisma.business.findMany({ select: { featureOverrides: true, plan: { select: { features: true } } } }),
  ]);
  const usage = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { active: 0, forcedOn: 0, forcedOff: 0 }])) as Record<
    FeatureKey,
    FeatureUsage
  >;
  for (const business of businesses) {
    for (const key of resolveFeatures(business)) usage[key].active++;
    for (const [key, enabled] of Object.entries(parseOverrides(business.featureOverrides)) as [FeatureKey, boolean][]) {
      if (enabled) usage[key].forcedOn++;
      else usage[key].forcedOff++;
    }
  }
  return {
    totalBusinesses: businesses.length,
    plans: plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      active: p.active,
      isDefault: p.isDefault,
      businesses: p._count.businesses,
      features: p.features.filter(isFeatureKey),
    })),
    usage,
  };
}

/** Incluye o quita una función de un plan: cambia al momento en todos sus negocios (salvo ajustes a mano). */
export async function adminSetPlanFeature(admin: Admin, planId: string, feature: FeatureKey, enabled: boolean) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { _count: { select: { businesses: true } } },
  });
  if (!plan) throw notFound("Plan");
  const current = new Set(plan.features);
  if (enabled) current.add(feature);
  else current.delete(feature);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.plan.update({ where: { id: planId }, data: { features: [...current] } });
    await adminAudit(tx, admin, "plan.feature", "Plan", planId, { code: plan.code, feature, enabled });
    return { features: updated.features.filter(isFeatureKey), businesses: plan._count.businesses };
  });
}

/** Negocios y cómo tienen una función: por su plan, activada o desactivada a mano. */
export async function adminFeatureBusinesses(feature: FeatureKey) {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      featureOverrides: true,
      plan: { select: { name: true, features: true } },
    },
    orderBy: { name: "asc" },
  });
  return businesses
    .map((b) => {
      const override = parseOverrides(b.featureOverrides)[feature];
      return {
        id: b.id,
        name: b.name,
        status: b.status,
        planName: b.plan?.name ?? null,
        inPlan: b.plan ? b.plan.features.includes(feature) : true,
        mode: (override === undefined ? "plan" : override ? "on" : "off") as FeatureMode,
        active: resolveFeatures(b).includes(feature),
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
}

/** Ajuste de una sola función para un negocio (se guarda al momento, sin tocar las demás). */
export async function adminSetBusinessFeature(
  admin: Admin,
  businessId: string,
  feature: FeatureKey,
  mode: FeatureMode
) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { plan: true } });
  if (!business) throw notFound("Negocio");
  const overrides: FeatureOverrides = parseOverrides(business.featureOverrides);
  if (mode === "plan") delete overrides[feature];
  else overrides[feature] = mode === "on";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({
      where: { id: businessId },
      data: { featureOverrides: Object.keys(overrides).length > 0 ? overrides : Prisma.DbNull },
      include: { plan: true },
    });
    await adminAudit(tx, admin, "business.feature", "Business", businessId, { name: business.name, feature, mode });
    return { featureOverrides: overrides, features: resolveFeatures(updated) };
  });
}
