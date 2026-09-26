import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { resolveFeatures, accessState } from "@/lib/features";
import { addMember, authenticate, createBranch, registerAccount } from "@/server/account";
import { createSale } from "@/server/sales";
import { createOnlineOrder } from "@/server/online-orders";
import {
  adminBusinessDetail,
  adminCreateBusiness,
  adminCreatePlan,
  adminDeletePlan,
  adminListBusinesses,
  adminOverview,
  adminRecordPayment,
  adminResetPassword,
  adminUpdateBusiness,
  adminUpdatePlan,
  adminUpdateUser,
} from "@/server/admin";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const planInput = (overrides: Record<string, unknown> = {}) => ({
  code: `plan-${Math.random().toString(36).slice(2, 8)}`,
  name: "Básico",
  description: null,
  priceMonthly: 10,
  priceYearly: 100,
  currency: "USD",
  trialDays: 14,
  maxUsers: null,
  maxBranches: null,
  maxProducts: null,
  features: [] as never[],
  active: true,
  isDefault: false,
  isPublic: true,
  sortOrder: 0,
  ...overrides,
});

async function superAdmin(email = `admin-${Math.random()}@test.com`) {
  return prisma.user.create({
    data: { email, name: "Admin", passwordHash: await hashPassword("12345678"), isSuperAdmin: true },
  });
}

async function owner(plan?: string) {
  const { user, businessId } = await registerAccount({
    email: `sa-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Dueña",
    businessName: "Abarrotería",
    country: "PA",
    plan,
  });
  return { userId: user.id, businessId, role: "OWNER" as const };
}

async function featuresOf(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { plan: true } });
  return resolveFeatures(b);
}

describe.skipIf(!hasDatabase)("planes y registro", () => {
  beforeEach(resetDatabase);

  it("sin planes, el negocio nuevo tiene todo; con plan por defecto, empieza en prueba", async () => {
    const before = await owner();
    const b0 = await prisma.business.findUniqueOrThrow({ where: { id: before.businessId } });
    expect(b0.planId).toBeNull();
    expect(await featuresOf(before.businessId)).toContain("restaurant");

    const admin = await superAdmin();
    const pro = await adminCreatePlan(admin, planInput({ code: "pro", features: ["promotions"], isDefault: true }));
    const other = await adminCreatePlan(admin, planInput({ code: "otro", isDefault: true, trialDays: 0 }));
    // Solo un plan por defecto.
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: pro.id } })).isDefault).toBe(false);
    await adminUpdatePlan(admin, pro.id, planInput({ code: "pro", features: ["promotions"], isDefault: true }));

    const after = await owner();
    const b1 = await prisma.business.findUniqueOrThrow({ where: { id: after.businessId } });
    expect(b1.planId).toBe(pro.id);
    expect(b1.status).toBe("TRIAL");
    expect(b1.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(await featuresOf(after.businessId)).toEqual(["promotions"]);

    // El plan elegido en la página de precios; uno de pago sin prueba queda con el pago pendiente.
    const chosen = await owner("otro");
    const b2 = await prisma.business.findUniqueOrThrow({ where: { id: chosen.businessId } });
    expect(b2.planId).toBe(other.id);
    expect(b2.status).toBe("ACTIVE");
    expect(accessState(b2)).toMatchObject({ blocked: false, warning: { kind: "overdue" } });

    await expect(adminDeletePlan(admin, pro.id)).rejects.toThrow(/negocio/);
  });

  it("aplica los límites de usuarios, productos y sucursales", async () => {
    const admin = await superAdmin();
    await adminCreatePlan(
      admin,
      planInput({ code: "chico", maxUsers: 1, maxProducts: 1, maxBranches: 1, features: ["branches"], isDefault: true })
    );
    const actor = await owner();
    await makeProduct(actor, { price: 1 });
    await expect(makeProduct(actor, { price: 2 })).rejects.toThrow(/hasta 1 productos/);
    await expect(
      addMember(actor, { name: "Li", email: `li-${Math.random()}@test.com`, role: "CASHIER" })
    ).rejects.toThrow(/hasta 1 usuarios/);
    await expect(createBranch(actor, { name: "Sucursal 2", copyCatalog: false })).rejects.toThrow(/hasta 1 sucursales/);
  });
});

describe.skipIf(!hasDatabase)("funciones del plan en la venta y el catálogo", () => {
  beforeEach(resetDatabase);

  it("sin promociones ni vales en el plan, no se aplican", async () => {
    const actor = await owner();
    const p = await makeProduct(actor, { price: 1, stock: 10, taxRate: 0 });
    await prisma.promotion.create({
      data: { name: "2x1", type: "BUY_X_PAY_Y", buyQty: 2, payQty: 1, productId: p.id, businessId: actor.businessId },
    });
    const withPromo = await createSale(actor, saleInput([{ productId: p.id, quantity: 2 }]));
    expect(withPromo.total.toNumber()).toBe(1);
    const basic = { ...actor, features: ["export" as const] };
    const without = await createSale(basic, saleInput([{ productId: p.id, quantity: 2 }]));
    expect(without.total.toNumber()).toBe(2);
    await expect(
      createSale(
        basic,
        saleInput([{ productId: p.id, quantity: 1 }], { paymentMethod: "GIFT_CARD", giftCardCode: "X" })
      )
    ).rejects.toThrow(/Vales/);
  });

  it("el catálogo público se apaga sin la función o con el negocio suspendido", async () => {
    const admin = await superAdmin();
    const actor = await owner();
    await prisma.business.update({
      where: { id: actor.businessId },
      data: { catalogEnabled: true, catalogSlug: "tienda-sa" },
    });
    const p = await makeProduct(actor, { price: 1, stock: 10 });
    const order = {
      customerName: "Ana",
      phone: null,
      notes: null,
      fulfillment: "PICKUP" as const,
      address: null,
      items: [{ productId: p.id, quantity: 1 }],
    };
    await expect(createOnlineOrder("tienda-sa", order)).resolves.toMatchObject({ number: 1 });

    await adminUpdateBusiness(admin, actor.businessId, { adminNotes: "Cliente desde la feria" });
    await adminUpdateBusiness(admin, actor.businessId, { featureOverrides: { catalog: false } });
    // Un cambio parcial no borra las notas.
    expect((await adminBusinessDetail(actor.businessId)).adminNotes).toBe("Cliente desde la feria");
    await expect(createOnlineOrder("tienda-sa", order)).rejects.toThrow(/Catálogo/);

    await adminUpdateBusiness(admin, actor.businessId, { featureOverrides: {} });
    await expect(adminUpdateBusiness(admin, actor.businessId, { status: "SUSPENDED" })).rejects.toThrow(/motivo/);
    await adminUpdateBusiness(admin, actor.businessId, { status: "SUSPENDED", suspendedReason: "Falta de pago" });
    await expect(createOnlineOrder("tienda-sa", order)).rejects.toThrow(/Catálogo/);
    const detail = await adminBusinessDetail(actor.businessId);
    expect(detail.access).toEqual({ blocked: true, reason: "suspended", message: "Falta de pago" });
    expect(detail.audit.length).toBeGreaterThanOrEqual(3);
  });
});

describe.skipIf(!hasDatabase)("pagos, alta de negocios y usuarios", () => {
  beforeEach(resetDatabase);

  it("el pago extiende la vigencia desde el vencimiento y reactiva al suspendido", async () => {
    const admin = await superAdmin();
    const plan = await adminCreatePlan(admin, planInput({ code: "pro" }));
    const actor = await owner();
    const future = new Date(Date.now() + 10 * 86_400_000);
    await adminUpdateBusiness(admin, actor.businessId, { planId: plan.id, status: "ACTIVE", paidUntil: future });

    const payment = await adminRecordPayment(admin, actor.businessId, {
      amount: 100,
      method: "YAPPY",
      reference: "123",
      months: 12,
      periodStart: null,
      notes: null,
      reactivate: true,
    });
    expect(payment.periodStart.getTime()).toBe(future.getTime());
    const expected = new Date(future);
    expected.setUTCMonth(expected.getUTCMonth() + 12);
    expect(payment.periodEnd.getTime()).toBe(expected.getTime());

    await adminUpdateBusiness(admin, actor.businessId, {
      status: "SUSPENDED",
      suspendedReason: "Pago vencido",
      paidUntil: new Date(Date.now() - 86_400_000),
    });
    await adminRecordPayment(admin, actor.businessId, {
      amount: 10,
      method: "CASH",
      reference: null,
      months: 1,
      periodStart: null,
      notes: null,
      reactivate: true,
    });
    const b = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
    expect(b.status).toBe("ACTIVE");
    expect(b.suspendedReason).toBeNull();
    expect(b.paidUntil!.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);

    const overview = await adminOverview();
    expect(overview.collectedThisMonth).toEqual([{ currency: "USD", amount: 110 }]);
    expect(overview.mrr).toEqual([{ currency: "USD", amount: 10 }]);
    expect((await adminListBusinesses({ status: "ACTIVE" })).map((x) => x.id)).toContain(actor.businessId);
  });

  it("da de alta un negocio con dueño y contraseña temporal", async () => {
    const admin = await superAdmin();
    const plan = await adminCreatePlan(admin, planInput({ code: "pro", trialDays: 30 }));
    const result = await adminCreateBusiness(admin, {
      businessName: "Kiosco Nuevo",
      ownerName: "Rosa",
      email: "rosa@test.com",
      country: "PA",
      planId: plan.id,
    });
    expect(result.tempPassword).toHaveLength(12);
    expect(result.business).toMatchObject({ status: "TRIAL", planId: plan.id, currency: "USD" });
    const login = await authenticate({ email: "rosa@test.com", password: result.tempPassword! });
    expect(login.businessId).toBe(result.business.id);
    expect(login.user.mustChangePassword).toBe(true);
  });

  it("bloquea usuarios, protege al último administrador y entra sin negocio", async () => {
    const admin = await superAdmin("jefe@test.com");
    // El super admin sin negocios entra al panel (sesión sin negocio).
    expect((await authenticate({ email: "jefe@test.com", password: "12345678" })).businessId).toBe("");
    await expect(adminUpdateUser(admin, admin.id, { isSuperAdmin: false })).rejects.toThrow(/ti mismo/);

    const actor = await owner();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    await adminUpdateUser(admin, user.id, { disabled: true });
    await expect(authenticate({ email: user.email, password: "12345678" })).rejects.toThrow(/bloqueado/);
    const blocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(blocked.tokenVersion).toBe(user.tokenVersion + 1);

    await adminUpdateUser(admin, user.id, { disabled: false, isSuperAdmin: true });
    await adminUpdateUser(admin, user.id, { isSuperAdmin: false });
    const { tempPassword } = await adminResetPassword(admin, user.id);
    await expect(authenticate({ email: user.email, password: "12345678" })).rejects.toThrow();
    expect((await authenticate({ email: user.email, password: tempPassword })).user.mustChangePassword).toBe(true);
    expect(await prisma.adminAuditLog.count()).toBeGreaterThanOrEqual(4);
  });
});
