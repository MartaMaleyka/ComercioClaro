import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";

  const purchases = await prisma.purchase.findMany({
    where: {
      businessId,
      ...(search && {
        OR: [
          { supplier: { contains: search } },
          { notes: { contains: search } },
          { items: { some: { product: { name: { contains: search } } } } },
        ],
      }),
    },
    include: {
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(purchases);
}

export async function POST(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { items, supplier, notes } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Agrega al menos un producto" }, { status: 400 });
  }

  const purchase = await prisma.$transaction(async (tx) => {
    let total = 0;
    const purchaseItems: {
      productId: string;
      quantity: number;
      unitCost: number;
      subtotal: number;
    }[] = [];

    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId },
      });

      if (!product) throw new Error(`Producto no encontrado: ${item.productId}`);

      const unitCost = item.unitCost ?? product.cost;
      const subtotal = unitCost * item.quantity;
      total += subtotal;

      purchaseItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitCost,
        subtotal,
      });

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: { increment: item.quantity },
          cost: unitCost,
        },
      });
    }

    return tx.purchase.create({
      data: {
        total,
        supplier: supplier || null,
        notes: notes || null,
        businessId,
        items: { create: purchaseItems },
      },
      include: { items: { include: { product: true } } },
    });
  });

  return NextResponse.json(purchase, { status: 201 });
}
