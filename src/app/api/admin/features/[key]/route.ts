import { handler } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { isFeatureKey } from "@/lib/features";
import { adminFeatureBusinesses } from "@/server/admin-features";

/** Negocios y cómo tienen la función (por plan o ajustada a mano). */
export const GET = handler<{ key: string }>(async (_request, { params }) => {
  await requireSuperAdmin();
  const { key } = await params;
  if (!isFeatureKey(key)) throw notFound("Función");
  return adminFeatureBusinesses(key);
});
