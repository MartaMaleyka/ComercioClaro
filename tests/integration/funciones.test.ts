import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveFeatures } from "@/lib/features";
import {
  adminFeatureBusinesses,
  adminFeatureMatrix,
  adminSetBusinessFeature,
  adminSetPlanFeature,
} from "@/server/admin-features";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

const admin = { id: "admin-test" };

describe.skipIf(!hasDatabase)("funciones en el super admin", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const plan = await prisma.plan.create({
      data: { code: "pro-test", name: "Pro", priceMonthly: 20, features: ["payables", "splitPayments", "scale"] },
    });
    const a = await createOwner();
    const b = await createOwner();
    await prisma.business.updateMany({
      where: { id: { in: [a.businessId, b.businessId] } },
      data: { planId: plan.id },
    });
    const features = async (id: string) =>
      resolveFeatures(await prisma.business.findUniqueOrThrow({ where: { id }, include: { plan: true } }));
    return { plan, a, b, features };
  }

  it("quitar una función del plan la apaga al momento en sus negocios, salvo un ajuste a mano", async () => {
    const { plan, a, b, features } = await setup();
    await adminSetBusinessFeature(admin, b.businessId, "payables", "on");
    const result = await adminSetPlanFeature(admin, plan.id, "payables", false);
    expect(result).toEqual({ features: ["splitPayments", "scale"], businesses: 2 });
    expect(await features(a.businessId)).not.toContain("payables");
    expect(await features(b.businessId)).toContain("payables");
    expect(
      await prisma.adminAuditLog.findFirst({ where: { action: "plan.feature", entityId: plan.id } })
    ).toMatchObject({ details: { code: "pro-test", feature: "payables", enabled: false } });

    await adminSetPlanFeature(admin, plan.id, "payables", true);
    expect(await features(a.businessId)).toContain("payables");
  });

  it("el ajuste por negocio se guarda uno a uno y vuelve al plan", async () => {
    const { a, features } = await setup();
    await adminSetBusinessFeature(admin, a.businessId, "scale", "off");
    const saved = await adminSetBusinessFeature(admin, a.businessId, "recipes", "on");
    expect(saved.featureOverrides).toEqual({ scale: false, recipes: true });
    expect(saved.features).toContain("recipes");
    expect(saved.features).not.toContain("scale");

    await adminSetBusinessFeature(admin, a.businessId, "scale", "plan");
    const back = await adminSetBusinessFeature(admin, a.businessId, "recipes", "plan");
    expect(back.featureOverrides).toEqual({});
    expect((await prisma.business.findUniqueOrThrow({ where: { id: a.businessId } })).featureOverrides).toBeNull();
    expect(await features(a.businessId)).toEqual(["splitPayments", "scale", "payables"]);
  });

  it("la matriz cuenta negocios activos y ajustes, y la lista dice cómo la tiene cada uno", async () => {
    const { a, b } = await setup();
    await adminSetBusinessFeature(admin, a.businessId, "splitPayments", "off");
    await adminSetBusinessFeature(admin, b.businessId, "payroll", "on");
    const matrix = await adminFeatureMatrix();
    expect(matrix.totalBusinesses).toBe(2);
    expect(matrix.plans).toHaveLength(1);
    expect(matrix.plans[0]).toMatchObject({ name: "Pro", businesses: 2 });
    expect(matrix.usage.splitPayments).toEqual({ active: 1, forcedOn: 0, forcedOff: 1 });
    expect(matrix.usage.payroll).toEqual({ active: 1, forcedOn: 1, forcedOff: 0 });
    expect(matrix.usage.scale).toEqual({ active: 2, forcedOn: 0, forcedOff: 0 });

    const list = await adminFeatureBusinesses("splitPayments");
    expect(list.map((r) => [r.id, r.mode, r.active, r.inPlan])).toEqual([
      [b.businessId, "plan", true, true],
      [a.businessId, "off", false, true],
    ]);
  });
});
