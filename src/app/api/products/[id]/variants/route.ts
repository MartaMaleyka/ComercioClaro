import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { variantsSchema } from "@/lib/validation";
import { createVariants } from "@/server/catalog";

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "variants");
  return created(await createVariants(auth, (await params).id, await parseBody(request, variantsSchema)));
});
