import { beforeEach, describe, expect, it, vi } from "vitest";

// Las funciones de sesión escriben la cookie: fuera de una petición se simula el almacén de cookies.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

import { prisma } from "@/lib/prisma";
import type { sendEmail } from "@/lib/email";
import { currentSessionId, getAuth, getSessionUser, requireSuperAdmin } from "@/lib/auth";
import { totpCode } from "@/lib/totp";
import {
  beginMfaSetup,
  disableMfa,
  enableMfa,
  finishLogin,
  listSessions,
  loginHistory,
  mfaRequiredFor,
  readMfaChallenge,
  recordLogin,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  setMfaChallenge,
  verifyMfaCode,
} from "@/server/security";
import { adminChangeEmail, adminResetMfa, adminUserSecurity } from "@/server/admin-users";
import { hashPassword } from "@/lib/auth";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

const mailer = () => vi.fn<typeof sendEmail>(async () => true);
const chrome = { ip: "1.1.1.1", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0" };
const phone = { ip: "2.2.2.2", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604.1" };

describe.skipIf(!hasDatabase)("seguridad de las cuentas", () => {
  beforeEach(async () => {
    jar.clear();
    await resetDatabase();
  });

  async function owner() {
    const actor = await createOwner();
    await prisma.user.update({
      where: { id: actor.userId },
      data: { passwordHash: await hashPassword("Clave-Segura-2026") },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    return { actor, user };
  }

  it("activa los dos pasos con el primer código y entrega 10 códigos de recuperación de un solo uso", async () => {
    const { user } = await owner();
    const { secret, qr } = await beginMfaSetup(user.id);
    expect(qr).toMatch(/^data:image\/png;base64,/);
    await expect(enableMfa(user.id, "000000", mailer())).rejects.toThrow(/no es correcto/);

    const mail = mailer();
    const { recoveryCodes } = await enableMfa(user.id, totpCode(secret), mail);
    expect(recoveryCodes).toHaveLength(10);
    expect(mail.mock.calls[0][0].subject).toBe("Activaste la verificación en dos pasos");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpSecret).not.toContain(secret);
    expect(stored.totpRecoveryHashes).toHaveLength(10);

    expect(await verifyMfaCode(user.id, totpCode(secret))).toMatchObject({ ok: true, recovery: false });
    expect(await verifyMfaCode(user.id, recoveryCodes[0].toLowerCase())).toEqual({ ok: true, recovery: true, left: 9 });
    expect(await verifyMfaCode(user.id, recoveryCodes[0])).toEqual({ ok: false });
    expect(await verifyMfaCode(user.id, "123456")).toEqual({ ok: false });

    const { recoveryCodes: fresh } = await regenerateRecoveryCodes(user.id, totpCode(secret));
    expect(await verifyMfaCode(user.id, recoveryCodes[1])).toEqual({ ok: false });
    expect(await verifyMfaCode(user.id, fresh[0])).toMatchObject({ ok: true, recovery: true });
  });

  it("desactivarla pide contraseña y código, y no se puede si es obligatoria", async () => {
    const { actor, user } = await owner();
    const { secret } = await beginMfaSetup(user.id);
    await enableMfa(user.id, totpCode(secret), mailer());
    await expect(disableMfa(user.id, "otra-clave", totpCode(secret))).rejects.toThrow(/contraseña no es correcta/);

    await prisma.business.update({ where: { id: actor.businessId }, data: { requireMfa: true } });
    expect(await mfaRequiredFor(user)).toBe("business");
    await expect(disableMfa(user.id, "Clave-Segura-2026", totpCode(secret))).rejects.toThrow(/exige/);

    await prisma.business.update({ where: { id: actor.businessId }, data: { requireMfa: false } });
    expect(await disableMfa(user.id, "Clave-Segura-2026", totpCode(secret))).toEqual({ enabled: false });
    expect(await mfaRequiredFor({ id: "x", isSuperAdmin: true })).toBe("admin");
  });

  it("un negocio que exige los dos pasos bloquea al usuario que no los tiene", async () => {
    const { actor, user } = await owner();
    await prisma.business.update({ where: { id: actor.businessId }, data: { requireMfa: true } });
    await finishLogin(user, actor.businessId, chrome, mailer());
    expect((await getAuth())?.mfaSetupRequired).toBe(true);
    const { secret } = await beginMfaSetup(user.id);
    await enableMfa(user.id, totpCode(secret), mailer());
    expect((await getAuth())?.mfaSetupRequired).toBe(false);
  });

  it("el super admin sin dos pasos no usa el panel", async () => {
    const { actor, user } = await owner();
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
    await finishLogin(user, actor.businessId, chrome, mailer());
    await expect(requireSuperAdmin()).rejects.toThrow(/verificación en dos pasos/);
    const { secret } = await beginMfaSetup(user.id);
    await enableMfa(user.id, totpCode(secret), mailer());
    expect((await requireSuperAdmin()).id).toBe(user.id);
  });

  it("cada inicio de sesión abre una sesión que se puede cerrar sola, y avisa de un dispositivo nuevo", async () => {
    const { actor, user } = await owner();
    const mail = mailer();
    await finishLogin(user, actor.businessId, chrome, mail); // primer acceso: sin aviso
    const first = await currentSessionId();
    await finishLogin(user, actor.businessId, chrome, mail); // mismo navegador: sin aviso
    expect(mail).not.toHaveBeenCalled();
    await finishLogin(user, actor.businessId, phone, mail); // dispositivo nuevo
    expect(mail.mock.calls[0][0]).toMatchObject({
      to: user.email,
      subject: "Nuevo inicio de sesión en tu cuenta de ComercioClaro",
    });
    expect(mail.mock.calls[0][0].text).toContain("Safari en iPhone o iPad");
    const current = await currentSessionId();

    let sessions = await listSessions(user.id, current);
    expect(sessions).toHaveLength(3);
    expect(sessions.find((s) => s.current)?.device).toBe("Safari en iPhone o iPad");

    // Cerrar una: ese token deja de valer.
    await revokeSession(user.id, current!);
    expect(await getSessionUser()).toBeNull();
    await expect(revokeSession(user.id, current!)).rejects.toThrow(/ya estaba cerrada/);

    expect(await revokeOtherSessions(user.id, first)).toEqual({ revoked: 1 });
    sessions = await listSessions(user.id, first);
    expect(sessions.map((s) => s.id)).toEqual([first]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).toBeInstanceOf(Date);
  });

  it("el reto de dos pasos vive en su propia cookie y guarda el historial", async () => {
    const { actor, user } = await owner();
    await setMfaChallenge(user.id, actor.businessId);
    expect(await readMfaChallenge()).toEqual({ userId: user.id, businessId: actor.businessId });
    await recordLogin({ userId: user.id, email: user.email, success: false, reason: "MFA_FAILED", meta: chrome });
    await recordLogin({ userId: null, email: "nadie@test.dev", success: false, reason: "UNKNOWN_EMAIL", meta: chrome });
    const history = await loginHistory(user.id);
    expect(history.map((h) => h.reason)).toEqual(["MFA_FAILED"]);
  });

  it("el super admin cambia el correo, quita los dos pasos y ve la actividad", async () => {
    const { actor, user } = await owner();
    const admin = { id: "admin-test" };
    await finishLogin(user, actor.businessId, chrome, mailer());
    const { secret } = await beginMfaSetup(user.id);
    await enableMfa(user.id, totpCode(secret), mailer());

    let security = await adminUserSecurity(user.id);
    expect(security).toMatchObject({ mfaEnabled: true, emailVerified: false });
    expect(security.sessions).toHaveLength(1);
    expect(security.history[0]).toMatchObject({ reason: "OK", device: "Chrome en Windows" });

    const resetMail = mailer();
    await adminResetMfa(admin, user.id, resetMail);
    expect(resetMail.mock.calls[0][0].subject).toBe("Se quitó la verificación en dos pasos de tu cuenta");
    expect(await getSessionUser()).toBeNull();

    const emailMail = mailer();
    await adminChangeEmail(admin, user.id, "nuevo@test.dev", emailMail);
    const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(changed).toMatchObject({ email: "nuevo@test.dev", emailVerifiedAt: null });
    expect(emailMail.mock.calls.map((c) => c[0].to)).toEqual(["nuevo@test.dev", user.email]);
    await expect(adminChangeEmail(admin, user.id, "nuevo@test.dev", mailer())).rejects.toThrow(/mismo correo/);
    security = await adminUserSecurity(user.id);
    expect(security.sessions).toHaveLength(0);
    expect(
      await prisma.adminAuditLog.count({
        where: { entityId: user.id, action: { in: ["user.mfaReset", "user.email"] } },
      })
    ).toBe(2);
  });
});
