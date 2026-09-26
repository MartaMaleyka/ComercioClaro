import type { AuthContext } from "@/lib/auth";
import type { SessionData } from "@/components/providers/SessionProvider";
import { listMemberships } from "./account";

/** Datos de la sesión que se pasan a los componentes cliente (sin secretos ni el QR completo). */
export async function sessionData(auth: AuthContext): Promise<SessionData> {
  const memberships = await listMemberships(auth.userId);
  const { business } = auth;
  return {
    user: { id: auth.user.id, name: auth.user.name, email: auth.user.email, language: auth.user.language },
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
      usesFreeInvoicer: business.usesFreeInvoicer,
      einvoiceMode: business.einvoiceMode,
      autoInvoice: business.autoInvoice,
      yappyMode: business.yappyMode,
      loyaltyEnabled: business.loyaltyEnabled,
      loyaltyPointValue: business.loyaltyPointValue.toNumber(),
    },
    businesses: memberships.map((m) => ({ id: m.business.id, name: m.business.name, role: m.role })),
  };
}
