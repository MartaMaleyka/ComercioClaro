import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET() {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [salesToday, salesMonth, purchasesMonth, products, recentSales] =
    await Promise.all([
      prisma.sale.aggregate({
        where: { businessId, createdAt: { gte: startOfToday } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { businessId, createdAt: { gte: startOfMonth } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.purchase.aggregate({
        where: { businessId, createdAt: { gte: startOfMonth } },
        _sum: { total: true },
      }),
      prisma.product.findMany({ where: { businessId } }),
      prisma.sale.findMany({
        where: { businessId },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const lowStockProducts = products.filter((p) => p.stock <= p.minStock);
  const totalInventoryValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const monthSales = salesMonth._sum.total || 0;
  const monthPurchases = purchasesMonth._sum.total || 0;

  return NextResponse.json({
    salesToday: {
      total: salesToday._sum.total || 0,
      count: salesToday._count,
    },
    salesMonth: {
      total: monthSales,
      count: salesMonth._count,
    },
    profitMonth: monthSales - monthPurchases,
    purchasesMonth: monthPurchases,
    totalProducts: products.length,
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 5),
    totalInventoryValue,
    recentSales,
  });
}
