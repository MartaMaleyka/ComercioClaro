"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface DashboardData {
  salesToday: { total: number; count: number };
  salesMonth: { total: number; count: number };
  profitMonth: number;
  purchasesMonth: number;
  totalProducts: number;
  lowStockCount: number;
  lowStockProducts: { id: string; name: string; stock: number; minStock: number }[];
  totalInventoryValue: number;
  recentSales: {
    id: string;
    total: number;
    createdAt: string;
    items: { product: { name: string }; quantity: number }[];
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tu negocio hoy</h1>
        <p className="text-slate-600 text-sm mt-1">
          Resumen de lo más importante
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="!py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-brand-600" />
              </div>
              <span className="text-xs text-slate-500">Ventas hoy</span>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(data.salesToday.total)}
            </p>
            <p className="text-xs text-slate-500">{data.salesToday.count} ventas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs text-slate-500">Ganancia del mes</span>
            </div>
            <p className={`text-xl font-bold ${data.profitMonth >= 0 ? "text-brand-600" : "text-red-500"}`}>
              {formatCurrency(data.profitMonth)}
            </p>
            <p className="text-xs text-slate-500">
              Ventas: {formatCurrency(data.salesMonth.total)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Package className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-xs text-slate-500">Productos</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{data.totalProducts}</p>
            <p className="text-xs text-slate-500">
              Valor: {formatCurrency(data.totalInventoryValue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="!py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs text-slate-500">Compras del mes</span>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(data.purchasesMonth)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.lowStockCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h2 className="font-semibold text-amber-800">
                {data.lowStockCount} producto{data.lowStockCount > 1 ? "s" : ""} con bajo inventario
              </h2>
            </div>
          </CardHeader>
          <CardContent className="!pt-0">
            <div className="space-y-2">
              {data.lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="text-amber-700 font-medium">
                    {p.stock} / mín. {p.minStock}
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/inventario?lowStock=true"
              className="inline-flex items-center gap-1 text-sm text-amber-700 font-medium mt-3 hover:text-amber-800"
            >
              Ver inventario <ArrowRight className="w-4 h-4" />
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Ventas recientes</h2>
            <Link
              href="/ventas"
              className="text-sm text-brand-600 font-medium hover:text-brand-700"
            >
              Ver todas
            </Link>
          </div>
        </CardHeader>
        <CardContent className="!pt-0">
          {data.recentSales.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              Aún no hay ventas registradas
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {sale.items.map((i) => i.product.name).join(", ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(sale.createdAt)}
                    </p>
                  </div>
                  <span className="font-semibold text-brand-600">
                    {formatCurrency(sale.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/ventas"
          className="flex items-center justify-center gap-2 py-4 bg-brand-600 text-white font-medium rounded-2xl hover:bg-brand-700 transition-colors"
        >
          <ShoppingCart className="w-5 h-5" />
          Nueva venta
        </Link>
        <Link
          href="/compras"
          className="flex items-center justify-center gap-2 py-4 bg-white text-slate-700 font-medium rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <Package className="w-5 h-5" />
          Nueva compra
        </Link>
      </div>
    </div>
  );
}
