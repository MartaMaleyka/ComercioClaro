import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión · ComercioClaro" };

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-secondary">
      <div className="text-center max-w-sm space-y-3">
        <WifiOff className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-slate-900">Sin conexión</h1>
        <p className="text-sm text-slate-600">
          Esta página no está disponible sin internet. El punto de venta sí funciona: las ventas se guardan en tu
          dispositivo y se envían al volver la conexión.
        </p>
        <Link href="/ventas" className="inline-block px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium">
          Ir a vender
        </Link>
      </div>
    </div>
  );
}
