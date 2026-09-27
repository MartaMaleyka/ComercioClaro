import { redirect } from "next/navigation";
import { getAuth, getSuperAdmin } from "@/lib/auth";
import { BlockedGate } from "@/components/layout/BlockedGate";
import { sessionData } from "@/server/session-view";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) {
    // Super admin sin negocio activo: va al panel de administración.
    if (await getSuperAdmin()) redirect("/admin");
    redirect("/login");
  }
  if (auth.user.mustChangePassword) redirect("/cambiar-contrasena");
  const blocked = auth.access.blocked && !auth.support;

  return (
    <SessionProvider value={await sessionData(auth)}>
      <ToastProvider>
        <ConfirmProvider>
          {blocked ? <BlockedGate>{children}</BlockedGate> : <AppLayout>{children}</AppLayout>}
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
