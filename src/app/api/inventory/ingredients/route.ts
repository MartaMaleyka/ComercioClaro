import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { ingredientsOverview } from "@/server/recipes";

/** Insumos con su existencia y platos con receta (costo por plato y margen). */
export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "recipes");
  return ingredientsOverview(auth.businessId);
});
