import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, businessId },
  });

  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const data = await request.json();

  const existing = await prisma.product.findFirst({ where: { id, businessId } });
  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.price !== undefined && { price: parseFloat(data.price) }),
      ...(data.cost !== undefined && { cost: parseFloat(data.cost) }),
      ...(data.stock !== undefined && { stock: parseInt(data.stock) }),
      ...(data.minStock !== undefined && { minStock: parseInt(data.minStock) }),
    },
  });

  return NextResponse.json(product);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, businessId } });
  if (!existing) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
