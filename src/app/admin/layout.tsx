import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminNeedsMfa, getSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Administración · ComercioClaro" };

/** Panel del super admin: planes, negocios, funciones, pagos y usuarios de la plataforma. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getSuperAdmin();
  if (!admin) redirect("/inicio");
  if (admin.mustChangePassword) redirect("/cambiar-contrasena");
  // El panel controla toda la plataforma: exige la verificación en dos pasos.
  if (adminNeedsMfa(admin)) redirect("/seguridad?motivo=admin");
  const hasBusiness = (await prisma.membership.count({ where: { userId: admin.id } })) > 0;
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminShell
          admin={{ name: admin.name, email: admin.email, language: admin.language }}
          hasBusiness={hasBusiness}
        >
          {children}
        </AdminShell>
      </ConfirmProvider>
    </ToastProvider>
  );
}
