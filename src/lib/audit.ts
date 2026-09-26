import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./prisma";

interface AuditActor {
  userId: string;
  businessId: string;
}

export async function audit(
  tx: Tx,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Prisma.InputJsonValue
) {
  await tx.auditLog.create({
    data: {
      action,
      entity,
      entityId: entityId ?? null,
      details,
      userId: actor.userId,
      businessId: actor.businessId,
    },
  });
}
