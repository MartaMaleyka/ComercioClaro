"use client";

import { useText } from "@/lib/client/i18n";
import type { AccessState } from "@/lib/features";
import { Badge } from "@/components/ui/Badge";

/** Estado: activo, en prueba, pago vencido, prueba vencida, suspendido, por aprobar o dado de baja. */
export function StatusBadge({ status, access }: { status: string; access: AccessState }) {
  const tr = useText();
  if (access.blocked) {
    if (access.reason === "pending") return <Badge dot tone="purple">{tr("Por aprobar")}</Badge>;
    if (access.reason === "closed") return <Badge dot tone="gray">{tr("Dado de baja")}</Badge>;
    return <Badge dot tone="red">{access.reason === "trialEnded" ? tr("Prueba vencida") : tr("Suspendido")}</Badge>;
  }
  if (access.warning?.kind === "overdue") return <Badge dot tone="amber">{tr("Pago vencido")}</Badge>;
  if (status === "TRIAL") return <Badge dot tone="blue">{tr("En prueba")}</Badge>;
  return <Badge dot tone="green">{tr("Activo")}</Badge>;
}
