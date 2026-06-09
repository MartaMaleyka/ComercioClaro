import Link from "next/link";
import {
  BarChart3,
  Package,
  ShoppingCart,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="px-4 py-6 max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-brand-800">ComercioClaro</span>
        </div>
        <div className="flex gap-2">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
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
            Tu negocio,{" "}
            <span className="text-brand-600">claro y bajo control</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
            Deja atrás el cuaderno y las hojas de cálculo. Administra ventas,
            compras, inventario y ganancias desde tu celular, de forma simple y
            segura.
          </p>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-8 py-4 bg-brand-600 text-white font-semibold rounded-2xl hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/25"
          >
            Comenzar gratis
            <TrendingUp className="w-5 h-5" />
          </Link>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {[
            {
              icon: ShoppingCart,
              title: "Ventas",
              desc: "Registra cada venta y actualiza tu inventario al instante.",
            },
            {
              icon: Package,
              title: "Compras",
              desc: "Lleva el control de lo que compras y a quién le compras.",
            },
            {
              icon: Wallet,
              title: "Inventario",
              desc: "Conoce qué tienes en stock y recibe alertas de bajo inventario.",
            },
            {
              icon: BarChart3,
              title: "Reportes",
              desc: "Visualiza tus ganancias y descubre tus productos más vendidos.",
            },
            {
              icon: TrendingUp,
              title: "Dashboard",
              desc: "Un vistazo rápido a lo más importante de tu negocio hoy.",
            },
            {
              icon: Store,
              title: "Tu negocio",
              desc: "Diseñado para kioscos, misceláneas, salones y tiendas familiares.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
            >
              <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-brand-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-sm text-slate-600">{item.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="px-4 py-8 text-center text-sm text-slate-500 border-t border-slate-100">
        © {new Date().getFullYear()} ComercioClaro — Hecho para pequeños negocios
      </footer>
    </div>
  );
}
