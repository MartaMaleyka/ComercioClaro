import Link from "next/link";
import { publicPlans } from "@/server/admin";
import { FEATURES } from "@/lib/features";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart3,
  FileText,
  HandCoins,
  Languages,
  Package,
  ShoppingCart,
  Smartphone,
  Store,
  Check,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";

// Los precios salen de los planes que administra el super admin.
export const dynamic = "force-dynamic";

async function loadPlans() {
  try {
    return await publicPlans();
  } catch {
    // Sin base de datos (p. ej. al compilar) la portada se muestra sin precios.
    return [];
  }
}

export default async function LandingPage() {
  const plans = await loadPlans();
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-surface-secondary">
      <header className="px-4 py-6 max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-brand-800">ComercioClaro</span>
        </div>
        <div className="flex gap-2">
          <Link href="/login" className="px-4 py-2 text-sm font-medium text-brand-700 hover:text-brand-800">
            Iniciar sesión
          </Link>
          <Link
            href="/registro"
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors"
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      <main className="px-4 py-12 max-w-5xl mx-auto">
        <section className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
            Tu negocio, <span className="text-brand-600">claro y bajo control</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
            Deja atrás el cuaderno y las hojas de cálculo. Vende, cobra fiado, haz tu corte de caja y conoce tu ganancia
            real desde el celular. Para kioscos, misceláneas, tiendas y salones.
          </p>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-600 text-white font-semibold rounded-2xl hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/25"
          >
            Comenzar gratis
            <TrendingUp className="w-5 h-5" />
          </Link>
        </section>

        <section aria-labelledby="funciones" className="mb-16">
          <h2 id="funciones" className="text-2xl font-bold text-slate-900 text-center mb-6">
            Todo lo que tu negocio necesita
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: ShoppingCart,
                title: "Punto de venta",
                desc: "Cobra rápido con lector de código de barras o la cámara del celular, incluso sin internet.",
              },
              {
                icon: HandCoins,
                title: "Fiado y clientes",
                desc: "Lleva la cuenta de quién te debe, con límite de crédito, abonos y recordatorios por WhatsApp.",
              },
              {
                icon: Wallet,
                title: "Caja y cortes",
                desc: "Abre y cierra caja, registra entradas y salidas y detecta faltantes al instante.",
              },
              {
                icon: Package,
                title: "Inventario",
                desc: "Existencias, venta a granel, caducidades y sugerencias de qué comprar.",
              },
              {
                icon: BarChart3,
                title: "Ganancia real",
                desc: "Utilidad calculada con el costo de lo vendido y tus gastos: sabrás cuánto ganas de verdad.",
              },
              {
                icon: FileText,
                title: "Factura electrónica",
                desc: "Panamá: factura DGI con PAC y aviso de los límites del facturador gratuito. México: CFDI 4.0 y factura global.",
              },
              {
                icon: Smartphone,
                title: "Yappy y tarjetas",
                desc: "Cobra con Yappy por celular o QR y conoce cuánto te cuestan las comisiones de cada forma de pago.",
              },
              {
                icon: Tag,
                title: "Promociones y puntos",
                desc: "2x1, precios por cantidad y puntos de lealtad que el punto de venta aplica solo.",
              },
              {
                icon: Languages,
                title: "Español, 中文 e inglés",
                desc: "Cada persona del equipo usa el sistema en su idioma.",
              },
            ].map((item) => (
              <li key={item.title} className="bg-surface rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div
                  className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mb-4"
                  aria-hidden="true"
                >
                  <item.icon className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {plans.length > 0 && (
          <section aria-labelledby="precios" className="mt-16">
            <h2 id="precios" className="text-2xl font-bold text-slate-900 text-center mb-2">
              Planes y precios
            </h2>
            <p className="text-center text-slate-600 mb-6">
              Todos incluyen punto de venta, caja, inventario, fiado y venta sin conexión.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="bg-surface rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col"
                >
                  <h3 className="font-semibold text-lg text-slate-900">{plan.name}</h3>
                  {plan.description && <p className="text-sm text-slate-600 mt-1">{plan.description}</p>}
                  <p className="mt-4">
                    <span className="text-3xl font-bold text-slate-900">
                      {formatCurrency(plan.priceMonthly.toNumber(), plan.currency, "es-PA")}
                    </span>
                    <span className="text-slate-500"> / mes</span>
                  </p>
                  {plan.priceYearly && (
                    <p className="text-sm text-slate-500">
                      o {formatCurrency(plan.priceYearly.toNumber(), plan.currency, "es-PA")} al año
                    </p>
                  )}
                  <ul className="mt-4 space-y-1 text-sm text-slate-700 flex-1">
                    {plan.trialDays > 0 && (
                      <li className="font-medium text-brand-700 dark:text-brand-300">{plan.trialDays} días de prueba</li>
                    )}
                    <li>{plan.maxUsers ? `Hasta ${plan.maxUsers} usuarios` : "Usuarios ilimitados"}</li>
                    <li>{plan.maxBranches ? `Hasta ${plan.maxBranches} sucursal(es)` : "Sucursales ilimitadas"}</li>
                    {FEATURES.filter((f) => plan.features.includes(f.key)).map((f) => (
                      <li key={f.key} className="flex items-start gap-1.5">
                        <Check className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/registro?plan=${plan.code}`}
                    className="mt-5 text-center px-4 py-2.5 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700"
                  >
                    Elegir {plan.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-100">
        © {new Date().getFullYear()} ComercioClaro — Hecho para pequeños negocios
      </footer>
    </div>
  );
}
