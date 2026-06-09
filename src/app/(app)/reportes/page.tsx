"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { BarChart3, TrendingUp, Award } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";

interface ReportData {
  totalSales: number;
  totalPurchases: number;
  totalProfit: number;
  bestSellers: { name: string; quantity: number; revenue: number }[];
  trends: { date: string; sales: number; purchases: number; profit: number }[];
  period: number;
}

const periods = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
];

export default function ReportesPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?period=${period}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const chartData = data.trends.map((t) => ({
    ...t,
    label: new Date(t.date + "T12:00:00").toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
    }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="text-sm text-slate-600">
          Analiza el rendimiento de tu negocio
        </p>
      </div>

      <div className="flex gap-2">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              period === p.value
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="!py-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Ventas totales</p>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(data.totalSales)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!py-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Compras totales</p>
            <p className="text-xl font-bold text-slate-900">
              {formatCurrency(data.totalPurchases)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!py-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Ganancia neta</p>
            <p
              className={`text-xl font-bold ${
                data.totalProfit >= 0 ? "text-brand-600" : "text-red-500"
              }`}
            >
              {formatCurrency(data.totalProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Tendencia de ventas</h2>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={60} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Ventas"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Ganancia"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">
              No hay datos para este período
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-slate-900">Productos más vendidos</h2>
          </div>
        </CardHeader>
        <CardContent className="!pt-0">
          {data.bestSellers.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Aún no hay ventas en este período
            </p>
          ) : (
            <>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.bestSellers.slice(0, 5)}
                    layout="vertical"
                    margin={{ left: 0, right: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      width={100}
                    />
                    <Tooltip />
                    <Bar dataKey="quantity" name="Unidades" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {data.bestSellers.map((item, i) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-brand-100 text-brand-700 text-xs font-bold rounded-full flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-sm text-slate-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">
                        {item.quantity} uds.
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(item.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900">Ventas vs Compras</h2>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={60} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="sales" name="Ventas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="purchases" name="Compras" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">
              No hay datos para este período
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
