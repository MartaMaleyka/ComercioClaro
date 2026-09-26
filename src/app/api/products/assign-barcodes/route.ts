import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { internalEan13 } from "@/lib/barcode";

const schema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500) });

/** Asigna un código de barras interno (EAN-13 prefijo 20) a los productos que no tienen. */
export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { ids } = await parseBody(request, schema);
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, businessId: auth.businessId, barcode: null },
    select: { id: true },
  });
  let assigned = 0;
  for (const p of products) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.product.update({ where: { id: p.id }, data: { barcode: internalEan13() } });
        assigned++;
        break;
      } catch {
        // Choque con un código existente (restricción única): se intenta con otro.
      }
    }
  }
  return { assigned };
});
