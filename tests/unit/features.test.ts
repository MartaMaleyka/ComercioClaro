import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, accessState, parseOverrides, resolveFeatures } from "@/lib/features";

describe("funciones por plan", () => {
  it("un negocio sin plan conserva todas las funciones", () => {
    expect(resolveFeatures({ plan: null, featureOverrides: null })).toEqual(FEATURE_KEYS);
  });

  it("toma las del plan y aplica los ajustes del super admin", () => {
    const plan = { features: ["promotions", "catalog", "desconocida"] };
    expect(resolveFeatures({ plan, featureOverrides: null })).toEqual(["promotions", "catalog"]);
    expect(resolveFeatures({ plan, featureOverrides: { catalog: false, restaurant: true } })).toEqual([
      "promotions",
      "restaurant",
    ]);
  });

  it("ignora ajustes mal formados", () => {
    expect(parseOverrides({ promotions: "sí", otra: true, loyalty: false })).toEqual({ loyalty: false });
    expect(parseOverrides([true])).toEqual({});
  });
});

describe("estado de la cuenta", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const base = { status: "ACTIVE", trialEndsAt: null, paidUntil: null, suspendedReason: null };
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

  it("suspendido bloquea con el motivo", () => {
    expect(accessState({ ...base, status: "SUSPENDED", suspendedReason: "Falta de pago" }, now)).toEqual({
      blocked: true,
      reason: "suspended",
      message: "Falta de pago",
    });
  });

  it("la prueba avisa en la última semana y bloquea al vencer", () => {
    expect(accessState({ ...base, status: "TRIAL", trialEndsAt: days(20) }, now)).toEqual({
      blocked: false,
      warning: null,
    });
    expect(accessState({ ...base, status: "TRIAL", trialEndsAt: days(3) }, now)).toEqual({
      blocked: false,
      warning: { kind: "trial", daysLeft: 3 },
    });
    expect(accessState({ ...base, status: "TRIAL", trialEndsAt: days(-1) }, now)).toMatchObject({
      blocked: true,
      reason: "trialEnded",
    });
  });

  it("el pago vencido solo avisa: suspender lo decide el administrador", () => {
    expect(accessState({ ...base, paidUntil: days(-2) }, now)).toMatchObject({
      blocked: false,
      warning: { kind: "overdue" },
    });
    expect(accessState({ ...base, paidUntil: days(5) }, now)).toEqual({ blocked: false, warning: null });
  });
});

describe("cambios parciales del super admin", () => {
  it("no borra las notas ni el motivo si no se envían", async () => {
    const { adminBusinessSchema } = await import("@/lib/validation");
    expect(adminBusinessSchema.parse({ featureOverrides: { catalog: false } })).toEqual({
      featureOverrides: { catalog: false },
      suspendedReason: undefined,
      adminNotes: undefined,
    });
    expect(adminBusinessSchema.parse({ adminNotes: "" }).adminNotes).toBeNull();
  });
});
