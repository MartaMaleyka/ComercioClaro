import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { listMemberships } from "@/server/account";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.mustChangePassword) redirect("/cambiar-contrasena");

  const memberships = await listMemberships(auth.userId);
  const { business } = auth;

  return (
    <SessionProvider
      value={{
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
      }}
    >
      <ToastProvider>
        <ConfirmProvider>
          <AppLayout>{children}</AppLayout>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
