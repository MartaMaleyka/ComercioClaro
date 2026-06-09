import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const period = request.nextUrl.searchParams.get("period") || "30";
  const days = parseInt(period);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [sales, purchases, saleItems] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, createdAt: { gte: startDate } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.purchase.findMany({
      where: { businessId, createdAt: { gte: startDate } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.saleItem.findMany({
      where: { sale: { businessId, createdAt: { gte: startDate } } },
      include: { product: true },
    }),
  ]);

  const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
  const totalProfit = totalSales - totalPurchases;

  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const item of saleItems) {
    if (!productSales[item.productId]) {
      productSales[item.productId] = {
        name: item.product.name,
        quantity: 0,
        revenue: 0,
      };
    }
    productSales[item.productId].quantity += item.quantity;
    productSales[item.productId].revenue += item.subtotal;
  }

  const bestSellers = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const dailyData: Record<string, { sales: number; purchases: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyData[key] = { sales: 0, purchases: 0 };
  }

  for (const sale of sales) {
    const key = sale.createdAt.toISOString().split("T")[0];
    if (dailyData[key]) dailyData[key].sales += sale.total;
  }
  for (const purchase of purchases) {
    const key = purchase.createdAt.toISOString().split("T")[0];
    if (dailyData[key]) dailyData[key].purchases += purchase.total;
  }

  const trends = Object.entries(dailyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      sales: data.sales,
      purchases: data.purchases,
      profit: data.sales - data.purchases,
    }));

  return NextResponse.json({
    totalSales,
    totalPurchases,
    totalProfit,
    bestSellers,
    trends,
    period: days,
  });
}
