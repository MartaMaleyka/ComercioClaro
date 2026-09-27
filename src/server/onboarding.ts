import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth";
import { providerName } from "./billing-providers";

/**
 * Guía de primeros pasos del dueño: pasos comunes y los que sugiere el tipo de negocio
 * (solo si su plan incluye la función). Los textos están en el cliente para traducirlos.
 */
export type OnboardingStepKey =
  | "email"
  | "products"
  | "cash"
  | "sale"
  | "team"
  | "recipes"
  | "scale"
  | "suppliers"
  | "promotions"
  | "expiry"
  | "plan";

export interface OnboardingStep {
  key: OnboardingStepKey;
  href: string | null;
  done: boolean;
}

export async function onboardingSteps(auth: Pick<AuthContext, "businessId" | "features" | "user" | "business">) {
  const { business, businessId } = auth;
  const has = (feature: string) => (auth.features as string[]).includes(feature);
  const type = business.businessType ?? "OTRO";
  const [products, sessions, sales, members, recipes, suppliers, promotions, expiring] = await Promise.all([
    prisma.product.count({ where: { businessId, archivedAt: null, isIngredient: false } }),
    prisma.cashSession.count({ where: { businessId } }),
    prisma.sale.count({ where: { businessId } }),
    prisma.membership.count({ where: { businessId } }),
    prisma.recipeItem.count({ where: { businessId } }),
    prisma.supplier.count({ where: { businessId } }),
    prisma.promotion.count({ where: { businessId } }),
    prisma.product.count({ where: { businessId, trackExpiry: true } }),
  ]);

  const steps: OnboardingStep[] = [
    { key: "email", href: null, done: auth.user.emailVerified },
    { key: "products", href: "/inventario", done: products > 0 },
    { key: "cash", href: "/caja", done: sessions > 0 },
    { key: "sale", href: "/ventas", done: sales > 0 },
    { key: "team", href: "/configuracion?tab=usuarios", done: members > 1 },
  ];
  if (type === "FONDA" && has("recipes"))
    steps.push({ key: "recipes", href: "/inventario?tab=insumos", done: recipes > 0 });
  if ((type === "MINISUPER" || type === "CARNICERIA") && has("scale")) {
    steps.push({ key: "scale", href: "/configuracion", done: business.weightBarcode !== null });
  }
  if ((type === "MINISUPER" || type === "FERRETERIA") && has("payables")) {
    steps.push({ key: "suppliers", href: "/proveedores", done: suppliers > 0 });
  }
  if (type === "TIENDA" && has("promotions"))
    steps.push({ key: "promotions", href: "/promociones", done: promotions > 0 });
  if (type === "FARMACIA") steps.push({ key: "expiry", href: "/inventario", done: expiring > 0 });
  // En prueba o con el primer pago pendiente, y con pago en línea disponible.
  const now = new Date();
  const pending = business.status === "TRIAL" || (business.paidUntil !== null && business.paidUntil <= now);
  if (providerName() && business.planId && pending) {
    steps.push({ key: "plan", href: "/configuracion/plan", done: false });
  }

  const done = steps.filter((s) => s.done).length;
  return {
    businessType: type,
    dismissed: business.onboardingDismissedAt !== null,
    complete: done === steps.length,
    done,
    total: steps.length,
    steps,
  };
}

export async function dismissOnboarding(businessId: string) {
  await prisma.business.update({ where: { id: businessId }, data: { onboardingDismissedAt: new Date() } });
  return { dismissed: true };
}
