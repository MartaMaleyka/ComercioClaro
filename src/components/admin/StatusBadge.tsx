"use client";

import { useText } from "@/lib/client/i18n";
import type { AccessState } from "@/lib/features";
import { Badge } from "@/components/ui/Badge";

/** Estado de la suscripción: activo, en prueba, pago vencido, prueba vencida o suspendido. */
export function StatusBadge({ status, access }: { status: string; access: AccessState }) {
  const tr = useText();
  if (access.blocked) {
    return <Badge tone="red">{access.reason === "trialEnded" ? tr("Prueba vencida") : tr("Suspendido")}</Badge>;
  }
  if (access.warning?.kind === "overdue") return <Badge tone="amber">{tr("Pago vencido")}</Badge>;
  if (status === "TRIAL") return <Badge tone="blue">{tr("En prueba")}</Badge>;
  return <Badge tone="green">{tr("Activo")}</Badge>;
}
