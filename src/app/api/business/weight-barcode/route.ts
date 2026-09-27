import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { weightBarcodeSchema } from "@/lib/validation";

/** Formato de las etiquetas de peso: se guarda aparte para no tocar el resto del negocio. */
export const PUT = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "scale");
  const format = await parseBody(request, weightBarcodeSchema);
  return prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: auth.businessId }, data: { weightBarcode: format } });
    await audit(tx, auth, "business.weightBarcode", "Business", auth.businessId, format);
    return format;
  });
});
