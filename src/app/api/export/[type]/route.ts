import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { serialize } from "@/lib/decimal";
import { listQuerySchema } from "@/lib/validation";
import { csvResponse } from "@/lib/csv";
import { exportBackup, exportCsv, EXPORT_TYPES, type ExportType } from "@/server/exports";

export const GET = handler<{ type: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { type } = await params;
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "backup") {
    const data = serialize(await exportBackup(auth.businessId));
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="respaldo-comercioclaro-${stamp}.json"`,
      },
    });
  }
  if (!EXPORT_TYPES.includes(type as ExportType)) throw new AppError(404, "Tipo de exportación no válido");
  const query = parseQuery(request, listQuerySchema);
  const csv = await exportCsv(auth.business, type as ExportType, query);
  return csvResponse(`${type}-${stamp}.csv`, csv);
});
