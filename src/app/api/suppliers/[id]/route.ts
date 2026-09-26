import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { supplierSchema } from "@/lib/validation";

async function findSupplier(businessId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, businessId } });
  if (!supplier) throw notFound("Proveedor");
  return supplier;
}

/** Detalle del proveedor con historial de precios por producto. */
export const GET = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const supplier = await findSupplier(auth.businessId, id);
  const items = await prisma.purchaseItem.findMany({
    where: { purchase: { supplierId: id, businessId: auth.businessId, status: "ACTIVE" } },
    include: {
      product: { select: { id: true, name: true, unit: true } },
      purchase: { select: { id: true, folio: true, createdAt: true } },
    },
    orderBy: { purchase: { createdAt: "desc" } },
    take: 300,
  });
  const priceHistory = new Map<string, { productId: string; name: string; unit: string; prices: { date: Date; unitCost: unknown; folio: number }[] }>();
  for (const item of items) {
    const entry = priceHistory.get(item.productId) ?? {
      productId: item.productId,
      name: item.product.name,
      unit: item.product.unit,
      prices: [],
    };
    entry.prices.push({ date: item.purchase.createdAt, unitCost: item.unitCost, folio: item.purchase.folio });
    priceHistory.set(item.productId, entry);
  }
  const purchases = await prisma.purchase.findMany({
    where: { supplierId: id, businessId: auth.businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { supplier, priceHistory: [...priceHistory.values()], purchases };
});

export const PUT = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await findSupplier(auth.businessId, id);
  const input = await parseBody(request, supplierSchema);
  return prisma.supplier.update({ where: { id }, data: input });
});

export const DELETE = handler<{ id: string }>(async (_request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  await findSupplier(auth.businessId, id);
  await prisma.supplier.update({ where: { id }, data: { archivedAt: new Date() } });
  return { success: true };
});
