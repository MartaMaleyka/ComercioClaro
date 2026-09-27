"use client";

import { useText } from "@/lib/client/i18n";
import type { AccessState } from "@/lib/features";
import { Badge } from "@/components/ui/Badge";

/** Estado: activo, en prueba, pago vencido, prueba vencida, suspendido, por aprobar o dado de baja. */
export function StatusBadge({ status, access }: { status: string; access: AccessState }) {
  const tr = useText();
  if (access.blocked) {
    if (access.reason === "pending") return <Badge tone="purple">{tr("Por aprobar")}</Badge>;
    if (access.reason === "closed") return <Badge tone="gray">{tr("Dado de baja")}</Badge>;
    return <Badge tone="red">{access.reason === "trialEnded" ? tr("Prueba vencida") : tr("Suspendido")}</Badge>;
  }
  if (access.warning?.kind === "overdue") return <Badge tone="amber">{tr("Pago vencido")}</Badge>;
  if (status === "TRIAL") return <Badge tone="blue">{tr("En prueba")}</Badge>;
  return <Badge tone="green">{tr("Activo")}</Badge>;
}
