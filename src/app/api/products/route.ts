import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";
  const lowStock = request.nextUrl.searchParams.get("lowStock") === "true";

  const products = await prisma.product.findMany({
    where: {
      businessId,
      ...(search && { name: { contains: search } }),
    },
    orderBy: { name: "asc" },
  });

  const filtered = lowStock
    ? products.filter((p) => p.stock <= p.minStock)
    : products;

  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { name, description, price, cost, stock, minStock } = await request.json();

  if (!name || price === undefined) {
    return NextResponse.json({ error: "Nombre y precio son obligatorios" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      name,
      description: description || null,
      price: parseFloat(price),
      cost: parseFloat(cost) || 0,
      stock: parseInt(stock) || 0,
      minStock: parseInt(minStock) || 5,
      businessId,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
