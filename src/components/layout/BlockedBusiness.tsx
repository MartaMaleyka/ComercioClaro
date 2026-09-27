"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, CreditCard, LogOut, Lock } from "lucide-react";
import { useText } from "@/lib/client/i18n";
import { clearOfflineData } from "@/lib/client/offline-db";
import { useSession } from "@/components/providers/SessionProvider";
import { Button } from "@/components/ui/Button";

/** Negocio suspendido o con la prueba vencida: no se puede usar hasta que el administrador lo active. */
export function BlockedBusiness() {
  const tr = useText();
  const { business, businesses, role } = useSession();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const access = business.access;
  const others = businesses.filter((b) => b.id !== business.id);
  const reason = access.blocked ? access.reason : "suspended";
  const copy =
    reason === "trialEnded"
      ? {
          title: tr("Terminó tu periodo de prueba"),
          body: tr("Para seguir usando {name}, contacta al administrador y activa un plan. Tus datos se conservan.", {
            name: business.name,
          }),
        }
      : reason === "pending"
        ? {
            title: tr("Tu negocio está en revisión"),
            body: tr("Estamos revisando el registro de {name}. Te avisaremos por correo en cuanto esté aprobado.", {
              name: business.name,
            }),
          }
        : reason === "closed"
          ? {
              title: tr("Negocio dado de baja"),
              body: tr("{name} fue dado de baja. Tus datos se conservan: contacta al administrador para reactivarlo.", {
                name: business.name,
              }),
            }
          : {
              title: tr("Negocio suspendido"),
              body: tr("{name} está suspendido. Contacta al administrador para reactivarlo. Tus datos se conservan.", {
                name: business.name,
              }),
            };

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    await clearOfflineData().catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  async function switchTo(businessId: string) {
    setBusy(true);
    const res = await fetch("/api/auth/switch-business", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
    });
    if (res.ok) {
      router.push("/inicio");
      router.refresh();
    } else setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-surface-secondary">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-slate-200 p-6 space-y-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">{copy.title}</h1>
        <p className="text-sm text-slate-600">{copy.body}</p>
        {access.blocked && access.message && (
          <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">
            {tr("Motivo")}: {access.message}
          </p>
        )}
        {role === "OWNER" && business.onlineBilling && (
          <Link
            href="/configuracion/plan"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-brand-700"
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" /> {tr("Pagar mi plan en línea")}
          </Link>
        )}
        {others.length > 0 && (
          <div className="space-y-2 text-left">
            <p className="text-sm font-medium text-slate-700">{tr("Entrar a otro negocio")}</p>
            {others.map((b) => (
              <Button
                key={b.id}
                variant="secondary"
                className="w-full justify-start"
                disabled={busy}
                onClick={() => switchTo(b.id)}
              >
                <Building2 className="w-4 h-4" aria-hidden="true" /> {b.name}
              </Button>
            ))}
          </div>
        )}
        <Button variant="secondary" className="w-full" onClick={logout} loading={busy}>
          <LogOut className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar sesión")}
        </Button>
      </div>
    </main>
  );
}
