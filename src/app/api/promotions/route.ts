import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { promotionSchema } from "@/lib/validation";

const include = { product: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } };

/** Promociones del negocio (el punto de venta las usa para mostrar el descuento). */
export const GET = handler(async () => {
  const auth = await requireAuth();
  return prisma.promotion.findMany({
    where: { businessId: auth.businessId },
    include,
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, promotionSchema);
  if (input.productId) {
    const product = await prisma.product.findFirst({ where: { id: input.productId, businessId: auth.businessId } });
    if (!product) throw new AppError(404, "Producto no encontrado");
  }
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, businessId: auth.businessId } });
    if (!category) throw new AppError(404, "Categoría no encontrada");
  }
  return created(
    await prisma.$transaction(async (tx) => {
      const promotion = await tx.promotion.create({ data: { ...input, businessId: auth.businessId }, include });
      await audit(tx, auth, "promotion.create", "Promotion", promotion.id, { name: promotion.name });
      return promotion;
    })
  );
});
