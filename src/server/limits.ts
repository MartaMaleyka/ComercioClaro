import { AppError } from "@/lib/errors";
import { prisma, type Tx } from "@/lib/prisma";

type Db = Tx | typeof prisma;

export type LimitKind = "users" | "branches" | "products";

const LABELS: Record<LimitKind, string> = { users: "usuarios", branches: "sucursales", products: "productos" };

/** Cuánto se usa de cada límite del plan. */
export async function limitUsage(db: Db, businessId: string, ownerId?: string) {
  const [users, products, branches] = await Promise.all([
    db.membership.count({ where: { businessId } }),
    db.product.count({ where: { businessId, archivedAt: null } }),
    ownerId ? db.membership.count({ where: { userId: ownerId, role: "OWNER" } }) : Promise.resolve(0),
  ]);
  return { users, products, branches };
}

/**
 * Impide pasar el límite del plan del negocio (usuarios por negocio, sucursales del dueño,
 * productos activos). Sin plan o sin límite no se restringe.
 */
export async function assertWithinLimit(
  db: Db,
  actor: { businessId: string; userId: string },
  kind: LimitKind,
  adding = 1
) {
  const business = await db.business.findUniqueOrThrow({ where: { id: actor.businessId }, include: { plan: true } });
  const plan = business.plan;
  if (!plan) return;
  const max = kind === "users" ? plan.maxUsers : kind === "branches" ? plan.maxBranches : plan.maxProducts;
  if (max == null) return;
  const usage = await limitUsage(db, actor.businessId, actor.userId);
  if (usage[kind] + adding > max) {
    throw new AppError(
      403,
      `Tu plan ${plan.name} permite hasta ${max} ${LABELS[kind]}. Pide al administrador un plan con más capacidad.`
    );
  }
}
