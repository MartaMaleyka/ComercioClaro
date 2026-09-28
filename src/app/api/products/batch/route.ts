import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { productBatchSchema } from "@/lib/product-batch";
import { batchUpdateProducts } from "@/server/catalog";

/** Acciones en lote del inventario: precio, categoría, stock mínimo, archivar o restaurar. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  return batchUpdateProducts(auth, await parseBody(request, productBatchSchema));
});
