import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";

  const sales = await prisma.sale.findMany({
    where: {
      businessId,
      ...(search && {
        OR: [
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

  return NextResponse.json(sales);
}

export async function POST(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { items, notes } = await request.json();

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Agrega al menos un producto" }, { status: 400 });
  }

  try {
  const sale = await prisma.$transaction(async (tx) => {
    let total = 0;
    const saleItems: {
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    for (const item of items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId },
      });

      if (!product) throw new Error(`Producto no encontrado: ${item.productId}`);
      if (product.stock < item.quantity) {
        throw new Error(`Stock insuficiente para ${product.name}`);
      }

      const unitPrice = item.unitPrice ?? product.price;
      const subtotal = unitPrice * item.quantity;
      total += subtotal;

      saleItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });

      await tx.product.update({
        where: { id: product.id },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return tx.sale.create({
      data: {
        total,
        notes: notes || null,
        businessId,
        items: { create: saleItems },
      },
      include: { items: { include: { product: true } } },
    });
  });

  return NextResponse.json(sale, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al registrar la venta";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
