"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useText } from "@/lib/client/i18n";
import { useSession } from "@/components/providers/SessionProvider";
import { PlanBilling } from "@/components/billing/PlanBilling";
import { PageHeader } from "@/components/ui/Misc";

function MyPlan() {
  const tr = useText();
  const { role, business } = useSession();
  const params = useSearchParams();
  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href={business.access.blocked ? "/inicio" : "/configuracion"}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />{" "}
        {business.access.blocked ? tr("Volver") : tr("Configuración")}
      </Link>
      <PageHeader
        title={tr("Mi plan")}
        description={tr("Tu suscripción a ComercioClaro: pagos, tarjeta y renovación.")}
      />
      {role === "OWNER" ? (
        <PlanBilling result={params.get("pago")} />
      ) : (
        <p className="text-sm text-slate-600">{tr("Solo el dueño del negocio puede ver y pagar el plan.")}</p>
      )}
    </div>
  );
}

export default function MyPlanPage() {
  return (
    <Suspense>
      <MyPlan />
    </Suspense>
  );
}
