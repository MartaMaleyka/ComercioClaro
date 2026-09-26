import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { sessionData } from "@/server/session-view";
import { AppLayout } from "@/components/layout/AppLayout";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.mustChangePassword) redirect("/cambiar-contrasena");

  return (
    <SessionProvider value={await sessionData(auth)}>
      <ToastProvider>
        <ConfirmProvider>
          <AppLayout>{children}</AppLayout>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
