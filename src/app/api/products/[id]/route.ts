import { handler, parseBody } from "@/lib/api";
import { requireAuth, withoutVariants } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { productUpdateSchema } from "@/lib/validation";
import { updateProduct } from "@/server/catalog";
import { publicProduct } from "@/server/views";

export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth();
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, businessId: auth.businessId },
    include: {
      category: { select: { id: true, name: true } },
      batches: { where: { remaining: { gt: 0 } }, orderBy: { expiresAt: { sort: "asc", nulls: "last" } } },
    },
  });
  if (!product) throw notFound("Producto");
  return { ...publicProduct(product, auth.role), batches: product.batches };
});

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const input = withoutVariants(auth, await parseBody(request, productUpdateSchema));
  return updateProduct(auth, id, input);
});

/** Archiva el producto: se oculta del catálogo pero conserva su historial. */
export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await updateProduct(auth, id, { archived: true });
  return { success: true };
});
