import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { bulkUpdateProducts } from "@/server/catalog";

const MAX_PRODUCTS = 2000;

const bodySchema = z.object({
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "No hay cambios para guardar")
    .max(MAX_PRODUCTS, `Máximo ${MAX_PRODUCTS} productos por vez`),
});

/** Edición masiva desde la tabla del inventario (precios, costo, categoría, stock mínimo, archivar). */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { rows } = await parseBody(request, bodySchema);
  return bulkUpdateProducts(auth, rows);
});
