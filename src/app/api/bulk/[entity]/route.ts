import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { BULK_ENTITIES, BULK_MAX_ROWS, type BulkEntity } from "@/lib/bulk";
import { bulkImport } from "@/server/bulk";

const bodySchema = z.object({
  rows: z
    .array(z.record(z.string(), z.string().max(2000)))
    .min(1, "No hay filas para importar")
    .max(BULK_MAX_ROWS, `Máximo ${BULK_MAX_ROWS} filas por carga`),
  lines: z.array(z.number().int().min(1)).max(BULK_MAX_ROWS).optional(),
});

/** Carga masiva: filas ya leídas en el navegador (pegadas desde Excel o de un CSV). */
export const POST = handler<{ entity: string }>(async (request, { params }) => {
  const { entity } = await params;
  if (!(BULK_ENTITIES as readonly string[]).includes(entity)) throw new AppError(404, "No se puede importar esto");
  const auth = await requireAuth("OWNER");
  if (entity === "employees") requireFeature(auth, "payroll");
  const { rows, lines } = await parseBody(request, bodySchema);
  return bulkImport(auth, entity as BulkEntity, rows, lines);
});
