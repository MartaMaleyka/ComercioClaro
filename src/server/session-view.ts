import type { AuthContext } from "@/lib/auth";
import type { SessionData } from "@/components/providers/SessionProvider";
import { listMemberships } from "./account";
import type { FeatureKey } from "@/lib/features";
import { weightBarcodeFormat } from "@/lib/scale";
import { providerName } from "./billing-providers";

/** Datos de la sesión que se pasan a los componentes cliente (sin secretos ni el QR completo). */
export async function sessionData(auth: AuthContext): Promise<SessionData> {
  const memberships = await listMemberships(auth.userId);
  const { business } = auth;
  const has = (feature: FeatureKey) => auth.features.includes(feature);
  return {
    user: {
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      language: auth.user.language,
      isSuperAdmin: auth.user.isSuperAdmin,
    },
    support: auth.support,
    role: auth.role,
    business: {
      id: business.id,
      name: business.name,
      currency: business.currency,
      locale: business.locale,
      timezone: business.timezone,
      phone: business.phone,
      address: business.address,
      country: business.country,
      showBalboa: business.showBalboa,
      ruc: business.ruc,
      dv: business.dv,
      rfc: business.rfc,
      yappyDirectory: business.yappyDirectory,
      hasYappyQr: Boolean(business.yappyQr),
      // Valores efectivos: una función fuera del plan se ve apagada aunque esté configurada.
      catalogEnabled: business.catalogEnabled && has("catalog"),
      restaurantMode: business.restaurantMode && has("restaurant"),
      usesFreeInvoicer: business.usesFreeInvoicer,
      einvoiceMode: business.einvoiceMode,
      autoInvoice: business.autoInvoice,
      yappyMode: business.yappyMode === "API" && has("yappyApi") ? "API" : "STATIC",
      loyaltyEnabled: business.loyaltyEnabled && has("loyalty"),
      loyaltyPointValue: business.loyaltyPointValue.toNumber(),
      seniorDiscountRate: business.seniorDiscountRate.toNumber(),
      offlineDays: business.offlineDays,
      weightBarcode: weightBarcodeFormat(business.weightBarcode, business.country),
      region: business.region,
      features: auth.features,
      plan: business.plan ? { name: business.plan.name, code: business.plan.code } : null,
      access: auth.access,
      // Pago en línea del plan: si está configurado y si el negocio puede pagar (no lo suspendió el administrador).
      onlineBilling: Boolean(providerName()) && !(business.status === "SUSPENDED" && !business.suspendedByBilling),
    },
    businesses: memberships.map((m) => ({ id: m.business.id, name: m.business.name, role: m.role })),
  };
}
