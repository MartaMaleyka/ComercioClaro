import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { sendEmail } from "@/lib/email";
import { resolveFeatures } from "@/lib/features";
import { registerAccount, sendVerificationEmail, verifyEmail } from "@/server/account";
import { onboardingSteps } from "@/server/onboarding";
import { runBillingCron } from "@/server/billing";
import { hasDatabase, makeProduct, resetDatabase } from "../helpers";

const DAY = 86_400_000;
const mailer = () => vi.fn<typeof sendEmail>(async () => true);
const tokenFrom = (text: string) => text.match(/token=([a-f0-9]{64})/)![1];

const input = {
  email: "maria@fonda.test",
  password: "clave-segura-1",
  name: "María",
  businessName: "Fonda María",
  country: "PA" as const,
  phone: "6123-4567",
  businessType: "FONDA" as const,
  plan: null,
};

describe.skipIf(!hasDatabase)("registro", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    delete process.env.BILLING_PROVIDER;
  });

  it("guarda términos, tipo y origen; envía la bienvenida y avisa al super admin", async () => {
    await prisma.user.create({
      data: { email: "admin@plataforma.test", passwordHash: "x", name: "Admin", isSuperAdmin: true },
    });
    const mail = mailer();
    const { user, businessId, next } = await registerAccount(input, mail);
    expect(next).toBe("/dashboard");

    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.termsAcceptedAt).toBeInstanceOf(Date);
    expect(saved.termsVersion).toBe("2026-09");
    expect(saved.emailVerifiedAt).toBeNull();
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    expect(business).toMatchObject({
      businessType: "FONDA",
      signupSource: "SELF",
      phone: "6123-4567",
      restaurantMode: true,
      country: "PA",
    });

    const [welcome, notice] = mail.mock.calls.map((c) => c[0]);
    expect(welcome.to).toBe("maria@fonda.test");
    expect(welcome.text).toMatch(/verificar-correo\?token=[a-f0-9]{64}/);
    expect(notice).toMatchObject({ to: "admin@plataforma.test", subject: "Nuevo registro: Fonda María" });
    expect(notice.text).toContain("Fonda, restaurante o cafetería");
    expect(
      await prisma.adminAuditLog.findFirst({ where: { action: "business.register", entityId: businessId } })
    ).toMatchObject({ userId: user.id });
  });

  it("el correo se confirma con el enlace una sola vez y un enlace nuevo anula el anterior", async () => {
    const mail = mailer();
    const { user } = await registerAccount(input, mail);
    const first = tokenFrom(mail.mock.calls[0][0].text);

    await sendVerificationEmail(user.id, mail);
    const second = tokenFrom(mail.mock.calls[1][0].text);
    await expect(verifyEmail(first)).rejects.toThrow(/no es válido/);
    expect(await verifyEmail(second)).toEqual({ email: "maria@fonda.test" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyEmail(second)).rejects.toThrow(/no es válido/);
    expect(await sendVerificationEmail(user.id, mail)).toEqual({ alreadyVerified: true });
  });

  it("un enlace vencido no confirma", async () => {
    const mail = mailer();
    const { user } = await registerAccount(input, mail);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyExpires: new Date(Date.now() - 1000) } });
    await expect(verifyEmail(tokenFrom(mail.mock.calls[0][0].text))).rejects.toThrow(/venció/);
  });

  it("con un plan de pago sin prueba lleva a pagar en línea", async () => {
    await prisma.plan.create({
      data: { code: "pro", name: "Pro", priceMonthly: 20, trialDays: 0, features: [], isPublic: true },
    });
    process.env.BILLING_PROVIDER = "simulado";
    const { next } = await registerAccount({ ...input, plan: "pro" }, mailer());
    expect(next).toBe("/configuracion/plan");
  });

  it("la guía de primeros pasos se arma por tipo y avanza con lo que hace el dueño", async () => {
    const { user, businessId } = await registerAccount(input, mailer());
    const load = async () => {
      const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { plan: true } });
      const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      return onboardingSteps({
        businessId,
        business,
        features: resolveFeatures(business),
        user: { ...u, emailVerified: Boolean(u.emailVerifiedAt) },
      } as Parameters<typeof onboardingSteps>[0]);
    };
    let guide = await load();
    expect(guide.steps.map((s) => s.key)).toEqual(["email", "products", "cash", "sale", "team", "recipes"]);
    expect(guide).toMatchObject({ done: 0, total: 6, complete: false, dismissed: false });

    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await makeProduct({ userId: user.id, businessId, role: "OWNER" });
    guide = await load();
    expect(guide.steps.filter((s) => s.done).map((s) => s.key)).toEqual(["email", "products"]);
  });

  it("avisa por correo una sola vez cuando la prueba está por terminar", async () => {
    const plan = await prisma.plan.create({
      data: { code: "pro", name: "Pro", priceMonthly: 20, trialDays: 14, features: [], isDefault: true },
    });
    const { businessId } = await registerAccount(input, mailer());
    await prisma.business.update({
      where: { id: businessId },
      data: { planId: plan.id, status: "TRIAL", trialEndsAt: new Date(Date.now() + 2 * DAY) },
    });
    const mail = mailer();
    expect((await runBillingCron(new Date(), { mail, provider: null })).trialNotices).toBe(1);
    expect(mail.mock.calls[0][0].subject).toMatch(/^Tu prueba termina el/);
    expect((await runBillingCron(new Date(), { mail, provider: null })).trialNotices).toBe(0);
  });
});
