"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/components/providers/SessionProvider";
import { BlockedBusiness } from "./BlockedBusiness";

/**
 * Negocio bloqueado (suspendido o prueba vencida): solo se muestra el aviso, salvo "Mi plan" para
 * que el dueño pueda pagar en línea y reactivarlo.
 */
export function BlockedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, business } = useSession();
  if (role === "OWNER" && business.onlineBilling && pathname.startsWith("/configuracion/plan")) {
    return (
      <main id="contenido" className="min-h-screen bg-surface-secondary p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">{children}</div>
      </main>
    );
  }
  return <BlockedBusiness />;
}
