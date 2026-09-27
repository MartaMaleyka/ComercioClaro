import { AppError, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { D } from "@/lib/decimal";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { adminAudit } from "./admin";

/**
 * Ciclo de vida de un negocio en el panel del super admin: aprobar un registro, dar de baja
 * (los datos se conservan) y reactivar. Cada acción queda en la bitácora y se avisa al dueño.
 */

interface Admin {
  id: string;
}

type Mailer = typeof sendEmail;

async function mailOwners(mail: Mailer, businessId: string, subject: string, lines: string[]) {
  const owners = await prisma.membership.findMany({
    where: { businessId, role: "OWNER", user: { disabledAt: null } },
    include: { user: { select: { email: true } } },
  });
  const link = `${getAppUrl()}/login`;
  for (const o of owners) {
    await mail({
      to: o.user.email,
      subject,
      text: [...lines, "", `Entrar: ${link}`].join("\n"),
      html: `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}<p><a href="${link}">Entrar a ComercioClaro</a></p>`,
    }).catch(() => false);
  }
}

/** ¿Los registros nuevos esperan la aprobación del super admin? */
export async function signupApprovalRequired() {
  const row = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  return row?.requireSignupApproval ?? false;
}

export async function setSignupApproval(admin: Admin, enabled: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "platform" },
      create: { requireSignupApproval: enabled },
      update: { requireSignupApproval: enabled },
    });
    await adminAudit(tx, admin, "signup.approval", "PlatformSettings", "platform", { enabled });
    return { requireSignupApproval: enabled };
  });
}

/** Aprueba un registro: empieza la prueba del plan (o queda activo) desde hoy. */
export async function adminApproveBusiness(admin: Admin, id: string, mail: Mailer = sendEmail) {
  const business = await prisma.business.findUnique({ where: { id }, include: { plan: true } });
  if (!business) throw notFound("Negocio");
  if (business.status !== "PENDING") throw new AppError(400, "Este negocio no está esperando aprobación");
  const now = new Date();
  const plan = business.plan;
  const data =
    plan && plan.trialDays > 0
      ? { status: "TRIAL" as const, trialEndsAt: new Date(now.getTime() + plan.trialDays * 86_400_000) }
      : { status: "ACTIVE" as const, paidUntil: plan && D(plan.priceMonthly).gt(0) ? now : null };
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.business.update({ where: { id }, data });
    await adminAudit(tx, admin, "business.approve", "Business", id, { name: business.name });
    return saved;
  });
  await mailOwners(mail, id, `Tu negocio fue aprobado · ${business.name}`, [
    `¡Listo! Aprobamos el registro de ${business.name}. Ya puedes entrar y empezar a vender.`,
    ...(data.status === "TRIAL" ? [`Tu prueba del plan ${plan!.name} dura ${plan!.trialDays} días.`] : []),
  ]);
  return updated;
}

/**
 * Da de baja un negocio: no se puede usar, se detiene el cobro automático y los datos se
 * conservan para poder reactivarlo.
 */
export async function adminCloseBusiness(
  admin: Admin,
  id: string,
  input: { reason: string; notify: boolean },
  mail: Mailer = sendEmail
) {
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) throw notFound("Negocio");
  if (business.status === "CLOSED") throw new AppError(400, "El negocio ya está dado de baja");
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.business.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedReason: input.reason,
        autoRenew: false,
        nextChargeAt: null,
      },
    });
    await adminAudit(tx, admin, "business.close", "Business", id, {
      name: business.name,
      reason: input.reason,
      previousStatus: business.status,
    });
    return saved;
  });
  if (input.notify) {
    await mailOwners(mail, id, `Tu negocio fue dado de baja · ${business.name}`, [
      `${business.name} fue dado de baja en ComercioClaro.`,
      `Motivo: ${input.reason}`,
      "Tus datos se conservan. Si fue un error, responde este correo para reactivarlo.",
    ]);
  }
  return updated;
}

/** Reactiva un negocio dado de baja: vuelve a su prueba si aún está vigente, o queda activo. */
export async function adminReopenBusiness(admin: Admin, id: string, mail: Mailer = sendEmail) {
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) throw notFound("Negocio");
  if (business.status !== "CLOSED") throw new AppError(400, "El negocio no está dado de baja");
  const status = business.trialEndsAt && business.trialEndsAt > new Date() ? ("TRIAL" as const) : ("ACTIVE" as const);
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.business.update({
      where: { id },
      data: { status, closedAt: null, closedReason: null },
    });
    await adminAudit(tx, admin, "business.reopen", "Business", id, { name: business.name, status });
    return saved;
  });
  await mailOwners(mail, id, `Tu negocio fue reactivado · ${business.name}`, [
    `${business.name} está activo otra vez en ComercioClaro. Todos tus datos siguen ahí.`,
  ]);
  return updated;
}
