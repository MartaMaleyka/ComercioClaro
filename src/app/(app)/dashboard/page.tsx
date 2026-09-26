"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, CalendarClock, HandCoins, Package, ShoppingCart, Wallet } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState, ListSkeleton, PageHeader, Stat } from "@/components/ui/Misc";
import { useSession } from "@/components/providers/SessionProvider";

interface Summary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expenses: number;
  netProfit: number;
  salesCount: number;
  averageTicket: number;
  purchases: number;
}

interface DashboardData {
  today: Summary;
  month: Summary;
  lowStockProducts: { id: string; name: string; stock: number; minStock: number; unit: string }[];
  lowStockCount: number;
  totalProducts: number;
  totalInventoryValue: number;
  expiringBatches: { id: string; remaining: number; expiresAt: string; product: { id: string; name: string; unit: string } }[];
  receivables: { total: number; customers: number };
  cashSession: { id: string; openedAt: string } | null;
  recentSales: {
    id: string;
    folio: number;
    total: number;
    status: string;
    createdAt: string;
    customer: { name: string } | null;
    items: { product: { name: string } }[];
  }[];
}

export default function DashboardPage() {
  const { user } = useSession();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<DashboardData>("/api/dashboard", fetcher, { refreshInterval: 60_000 });

  const [now] = useState(() => Date.now());

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton rows={6} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        description="Así va tu negocio"
        actions={
          <Link href="/ventas">
            <Button>
              <ShoppingCart className="w-4 h-4" /> Vender
            </Button>
          </Link>
        }
      />

      <section aria-labelledby="hoy">
        <h2 id="hoy" className="text-sm font-semibold text-slate-500 mb-2">
          Hoy
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Ventas" value={fmt.money(data.today.revenue)} hint={`${data.today.salesCount} ventas`} />
          <Stat label="Utilidad bruta" value={fmt.money(data.today.grossProfit)} tone={data.today.grossProfit >= 0 ? "positive" : "negative"} />
          <Stat label="Ticket promedio" value={fmt.money(data.today.averageTicket)} />
          <Stat
            label="Caja"
            value={data.cashSession ? "Abierta" : "Cerrada"}
            tone={data.cashSession ? "positive" : "warning"}
            hint={
              <Link href="/caja" className="underline">
                {data.cashSession ? "Ver corte" : "Abrir caja"}
              </Link>
            }
          />
        </div>
      </section>

      <section aria-labelledby="mes">
        <h2 id="mes" className="text-sm font-semibold text-slate-500 mb-2">
          Este mes
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Ventas" value={fmt.money(data.month.revenue)} hint={`${data.month.salesCount} ventas`} />
          <Stat label="Utilidad bruta" value={fmt.money(data.month.grossProfit)} hint={`Margen ${data.month.grossMargin}%`} tone="positive" />
          <Stat label="Gastos" value={fmt.money(data.month.expenses)} hint={<Link href="/gastos" className="underline">Registrar gasto</Link>} />
          <Stat
            label="Ganancia neta"
            value={fmt.money(data.month.netProfit)}
            tone={data.month.netProfit >= 0 ? "positive" : "negative"}
            hint="Utilidad bruta − gastos"
          />
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Valor del inventario" value={fmt.money(data.totalInventoryValue)} hint={`${data.totalProducts} productos`} icon={<Package className="w-4 h-4 text-slate-400" />} />
        <Stat label="Compras del mes" value={fmt.money(data.month.purchases)} icon={<Wallet className="w-4 h-4 text-slate-400" />} />
        <Stat
          label="Fiado por cobrar"
          value={fmt.money(data.receivables.total)}
          hint={`${data.receivables.customers} clientes`}
          tone={data.receivables.total > 0 ? "warning" : "default"}
          icon={<HandCoins className="w-4 h-4 text-slate-400" />}
        />
        <Stat
          label="Bajo inventario"
          value={data.lowStockCount}
          tone={data.lowStockCount > 0 ? "negative" : "default"}
          hint={<Link href="/inventario?tab=reabastecer" className="underline">Qué comprar</Link>}
          icon={<AlertTriangle className="w-4 h-4 text-slate-400" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {data.lowStockProducts.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" aria-hidden="true" /> Por agotarse
              </h2>
              <Link href="/inventario?tab=reabastecer" className="text-sm text-brand-700 dark:text-brand-300">
                Ver todo
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.lowStockProducts.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-slate-700">{p.name}</span>
                  <span className={p.stock <= 0 ? "text-red-600 font-medium" : "text-amber-600 font-medium"}>
                    {fmt.qty(p.stock, p.unit)} / mín. {fmt.number(p.minStock)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.expiringBatches.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-red-500" aria-hidden="true" /> Próximos a caducar
              </h2>
              <Link href="/inventario?tab=caducidad" className="text-sm text-brand-700 dark:text-brand-300">
                Ver todo
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.expiringBatches.map((b) => {
                const expired = new Date(b.expiresAt).getTime() < now;
                return (
                  <div key={b.id} className="flex justify-between text-sm">
                    <span className="text-slate-700">
                      {b.product.name} · {fmt.qty(b.remaining, b.product.unit)}
                    </span>
                    <span className={expired ? "text-red-600 font-medium" : "text-amber-600"}>
                      {expired ? "Caducado" : fmt.date(b.expiresAt)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Ventas recientes</h2>
            <Link href="/ventas/historial" className="text-sm text-brand-700 dark:text-brand-300">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 py-0">
            {data.recentSales.length === 0 && <p className="py-4 text-sm text-slate-500">Aún no hay ventas.</p>}
            {data.recentSales.map((s) => (
              <Link key={s.id} href={`/ventas/${s.id}`} className="flex justify-between gap-3 py-3 text-sm hover:bg-slate-50 -mx-5 px-5">
                <span className="text-slate-700 truncate min-w-0">
                  #{s.folio} · {s.items.map((i) => i.product.name).join(", ")}
                  <span className="block text-xs text-slate-500">
                    {fmt.dateTime(s.createdAt)}
                    {s.customer && ` · ${s.customer.name}`}
                  </span>
                </span>
                <span className={s.status === "CANCELLED" ? "line-through text-slate-400" : "font-semibold text-brand-600"}>
                  {fmt.money(s.total)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
