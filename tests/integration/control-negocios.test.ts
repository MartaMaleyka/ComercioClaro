import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { sendEmail } from "@/lib/email";
import { accessState } from "@/lib/features";
import { registerAccount } from "@/server/account";
import { adminListBusinesses, adminOverview, recordSubscriptionPayment } from "@/server/admin";
import {
  adminApproveBusiness,
  adminCloseBusiness,
  adminReopenBusiness,
  setSignupApproval,
} from "@/server/admin-businesses";
import { createSale } from "@/server/sales";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const DAY = 86_400_000;
const admin = { id: "admin-test" };
const mailer = () => vi.fn<typeof sendEmail>(async () => true);

const signup = (email: string, extra: Partial<Parameters<typeof registerAccount>[0]> = {}) =>
  registerAccount(
    {
      email,
      password: "clave-segura-1",
      name: "Dueña",
      businessName: `Negocio ${email}`,
      country: "PA",
      businessType: "MINISUPER",
      plan: null,
      ...extra,
    },
    mailer()
  );

describe.skipIf(!hasDatabase)("control de negocios del super admin", () => {
  beforeEach(resetDatabase);

  async function withPlan() {
    return prisma.plan.create({
      data: { code: "pro", name: "Pro", priceMonthly: 20, trialDays: 14, features: [], isDefault: true },
    });
  }

  it("con aprobación a mano el registro espera y al aprobarlo empieza la prueba", async () => {
    await withPlan();
    await prisma.user.create({
      data: { email: "root@plataforma.test", passwordHash: "x", name: "Root", isSuperAdmin: true },
    });
    await setSignupApproval(admin, true);
    const mail = mailer();
    const { businessId } = await registerAccount(
      {
        email: "rosa@test.dev",
        password: "clave-segura-1",
        name: "Rosa",
        businessName: "Minisúper Rosa",
        country: "PA",
        businessType: "MINISUPER",
        plan: null,
      },
      mail
    );
    let business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business).toMatchObject({ status: "PENDING", trialEndsAt: null });
    expect(accessState(business)).toMatchObject({ blocked: true, reason: "pending" });
    expect(mail.mock.calls.map((c) => c[0].subject)).toContain("Registro por aprobar: Minisúper Rosa");
    expect(mail.mock.calls[0][0].text).toContain("Estamos revisando tu registro");

    const approvalMail = mailer();
    await adminApproveBusiness(admin, businessId, approvalMail);
    business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business.status).toBe("TRIAL");
    expect(business.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
    expect(approvalMail.mock.calls[0][0]).toMatchObject({
      to: "rosa@test.dev",
      subject: "Tu negocio fue aprobado · Minisúper Rosa",
    });
    await expect(adminApproveBusiness(admin, businessId, mailer())).rejects.toThrow(/no está esperando/);
    expect(await prisma.adminAuditLog.count({ where: { action: "business.approve", entityId: businessId } })).toBe(1);
  });

  it("dar de baja bloquea con el motivo, detiene el cobro y reactivar lo devuelve a su prueba", async () => {
    await withPlan();
    const { businessId } = await signup("baja@test.dev");
    await prisma.business.update({ where: { id: businessId }, data: { autoRenew: true, nextChargeAt: new Date() } });

    const mail = mailer();
    await adminCloseBusiness(admin, businessId, { reason: "Lo pidió el dueño", notify: true }, mail);
    let business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business).toMatchObject({
      status: "CLOSED",
      closedReason: "Lo pidió el dueño",
      autoRenew: false,
      nextChargeAt: null,
    });
    expect(accessState(business)).toEqual({ blocked: true, reason: "closed", message: "Lo pidió el dueño" });
    expect(mail.mock.calls[0][0].text).toContain("Motivo: Lo pidió el dueño");
    await expect(
      adminCloseBusiness(admin, businessId, { reason: "otra vez", notify: false }, mailer())
    ).rejects.toThrow(/ya está dado de baja/);

    await adminReopenBusiness(admin, businessId, mailer());
    business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business).toMatchObject({ status: "TRIAL", closedAt: null, closedReason: null });

    // Sin prueba vigente vuelve como activo; sin avisar al dueño no se envía correo.
    await prisma.business.update({ where: { id: businessId }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    const quiet = mailer();
    await adminCloseBusiness(admin, businessId, { reason: "Prueba", notify: false }, quiet);
    expect(quiet).not.toHaveBeenCalled();
    await adminReopenBusiness(admin, businessId, mailer());
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).status).toBe("ACTIVE");
  });

  it("la lista filtra por país, tipo, origen, fechas y estado, con actividad y correo confirmado", async () => {
    const a = await signup("a@test.dev", { country: "MX", businessType: "FONDA" });
    const b = await signup("b@test.dev");
    await prisma.user.update({ where: { id: b.user.id }, data: { emailVerifiedAt: new Date() } });
    await prisma.business.update({ where: { id: b.businessId }, data: { signupSource: "ADMIN" } });
    const product = await makeProduct({ userId: a.user.id, businessId: a.businessId, role: "OWNER" }, { stock: 10 });
    await createSale(
      { userId: a.user.id, businessId: a.businessId, role: "OWNER" },
      saleInput([{ productId: product.id, quantity: 1 }])
    );

    const names = async (query: Parameters<typeof adminListBusinesses>[0]) =>
      (await adminListBusinesses(query)).map((r) => r.name);
    expect(await names({ country: "MX" })).toEqual(["Negocio a@test.dev"]);
    expect(await names({ businessType: "MINISUPER" })).toEqual(["Negocio b@test.dev"]);
    expect(await names({ source: "ADMIN" })).toEqual(["Negocio b@test.dev"]);
    const today = new Date().toISOString().slice(0, 10);
    expect(await names({ from: today, to: today })).toHaveLength(2);
    expect(await names({ from: "2020-01-01", to: "2020-01-31" })).toEqual([]);

    const rows = await adminListBusinesses({});
    const rowA = rows.find((r) => r.id === a.businessId)!;
    const rowB = rows.find((r) => r.id === b.businessId)!;
    expect(rowA.lastSaleAt).toBeInstanceOf(Date);
    expect(rowA.lastLoginAt).toBeInstanceOf(Date);
    expect(rowA.owners[0].emailVerified).toBe(false);
    expect(rowB.owners[0].emailVerified).toBe(true);
    expect(rowB.lastSaleAt).toBeNull();

    await adminCloseBusiness(admin, b.businessId, { reason: "Duplicado", notify: false }, mailer());
    expect(await names({ status: "CLOSED" })).toEqual(["Negocio b@test.dev"]);
  });

  it("el embudo cuenta registrados, los que vendieron, pagaron y se dieron de baja", async () => {
    const a = await signup("uno@test.dev");
    const b = await signup("dos@test.dev");
    await signup("tres@test.dev");
    const actor = { userId: a.user.id, businessId: a.businessId, role: "OWNER" as const };
    const product = await makeProduct(actor, { stock: 5 });
    await createSale(actor, saleInput([{ productId: product.id, quantity: 1 }]));
    await prisma.$transaction((tx) =>
      recordSubscriptionPayment(tx, admin, a.businessId, {
        amount: 20,
        method: "TRANSFER",
        reference: null,
        months: 1,
        periodStart: null,
        notes: null,
        reactivate: true,
      })
    );
    await adminCloseBusiness(admin, b.businessId, { reason: "Duplicado", notify: false }, mailer());

    const overview = await adminOverview();
    const week = overview.funnel[overview.funnel.length - 1];
    expect(week).toMatchObject({ registered: 3, selfSignup: 3, sold: 1, paid: 1, closed: 1 });
    expect(overview.byStatus.CLOSED).toBe(1);
    expect(overview.recent).toHaveLength(3);
  });
});
