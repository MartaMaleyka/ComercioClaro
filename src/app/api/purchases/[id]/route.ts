import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const purchase = await prisma.purchase.findFirst({
    where: { id, businessId },
    include: { items: true },
  });

  if (!purchase) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    for (const item of purchase.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }
    await tx.purchase.delete({ where: { id } });
  });

  return NextResponse.json({ success: true });
}
