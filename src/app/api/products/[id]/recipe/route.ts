import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { recipeSchema } from "@/lib/validation";
import { getRecipe, saveRecipe } from "@/server/recipes";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "recipes");
  const { id } = await params;
  return getRecipe(auth.businessId, id);
});

/** Reemplaza la receta del plato; sin insumos, la borra. */
export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "recipes");
  const { id } = await params;
  const input = await parseBody(request, recipeSchema);
  await saveRecipe(auth, id, input);
  return getRecipe(auth.businessId, id);
});
