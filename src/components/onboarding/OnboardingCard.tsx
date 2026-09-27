"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CheckCircle2, Circle, Rocket, X } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import type { OnboardingStepKey } from "@/server/onboarding";
import { cn } from "@/lib/utils";

interface Onboarding {
  dismissed: boolean;
  complete: boolean;
  done: number;
  total: number;
  steps: { key: OnboardingStepKey; href: string | null; done: boolean }[];
}

/** Guía de primeros pasos del dueño (en el tablero), según su tipo de negocio. */
export function OnboardingCard() {
  const tr = useText();
  const toast = useToast();
  const { data, mutate } = useSWR<Onboarding>("/api/onboarding", fetcher);
  const [sending, setSending] = useState(false);

  if (!data || data.dismissed || data.complete) return null;

  const text: Record<OnboardingStepKey, { title: string; description: string; action: string }> = {
    email: {
      title: tr("Confirma tu correo"),
      description: tr("Así podrás recuperar tu contraseña y recibir los avisos de tu negocio."),
      action: tr("Reenviar enlace"),
    },
    products: {
      title: tr("Agrega tus productos"),
      description: tr("Uno por uno, con el lector de códigos o importándolos desde Excel."),
      action: tr("Ir al inventario"),
    },
    cash: {
      title: tr("Abre la caja"),
      description: tr("Indica con cuánto efectivo empiezas para cuadrar al cerrar."),
      action: tr("Abrir caja"),
    },
    sale: {
      title: tr("Haz tu primera venta"),
      description: tr("Cobra en efectivo, tarjeta, Yappy o fiado."),
      action: tr("Vender"),
    },
    team: {
      title: tr("Invita a tu equipo"),
      description: tr("Cada cajero con su usuario: sabrás quién vendió qué."),
      action: tr("Invitar"),
    },
    recipes: {
      title: tr("Arma tus recetas"),
      description: tr("Cada plato descuenta sus insumos y ves el costo por plato."),
      action: tr("Ir a insumos"),
    },
    scale: {
      title: tr("Configura tu balanza"),
      description: tr("Pesa desde el punto de venta y lee las etiquetas de peso."),
      action: tr("Configurar"),
    },
    suppliers: {
      title: tr("Registra a tus proveedores"),
      description: tr("Compra a crédito y lleva lo que debes y cuándo vence."),
      action: tr("Ir a proveedores"),
    },
    promotions: {
      title: tr("Crea una promoción"),
      description: tr("2x1, precio por cantidad o descuento por porcentaje."),
      action: tr("Ir a promociones"),
    },
    expiry: {
      title: tr("Controla la caducidad"),
      description: tr("Marca los productos con fecha de vencimiento para recibir alertas."),
      action: tr("Ir al inventario"),
    },
    plan: {
      title: tr("Elige cómo pagar tu plan"),
      description: tr("Paga en línea con tarjeta y olvídate de los vencimientos."),
      action: tr("Ver mi plan"),
    },
  };

  async function resend() {
    setSending(true);
    try {
      const res = await api<{ alreadyVerified: boolean }>("/api/auth/verify-email/resend", { method: "POST" });
      if (res.alreadyVerified) {
        toast.success(tr("Tu correo ya está confirmado"));
        mutate();
      } else toast.success(tr("Te enviamos un nuevo enlace. Revisa tu correo."));
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  async function dismiss() {
    try {
      await api("/api/onboarding/dismiss", { method: "POST" });
      mutate({ ...data!, dismissed: true }, { revalidate: false });
    } catch (err) {
      toast.error(err);
    }
  }

  const percent = Math.round((data.done / data.total) * 100);
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-brand-600" aria-hidden="true" /> {tr("Primeros pasos")}
            </h2>
            <p className="text-sm text-slate-600">
              {tr("{done} de {total} listos", { done: data.done, total: data.total })}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="p-2 -m-1 rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label={tr("Ocultar la guía de primeros pasos")}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>
        <ol className="divide-y divide-slate-100">
          {data.steps.map((step) => {
            const t = text[step.key];
            return (
              <li key={step.key} className="py-2.5 flex items-center gap-3">
                {step.done ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-brand-600" aria-hidden="true" />
                ) : (
                  <Circle className="w-5 h-5 shrink-0 text-slate-400" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={step.done ? "text-sm text-slate-500 line-through" : "text-sm font-medium text-slate-900"}
                  >
                    {t.title}
                    <span className="sr-only">{step.done ? ` (${tr("listo")})` : ` (${tr("pendiente")})`}</span>
                  </p>
                  {!step.done && <p className="text-xs text-slate-500">{t.description}</p>}
                </div>
                {!step.done &&
                  (step.key === "email" ? (
                    <Button size="sm" variant="secondary" onClick={resend} loading={sending}>
                      {t.action}
                    </Button>
                  ) : step.href ? (
                    <Link
                      href={step.href}
                      className={cn(buttonStyles("secondary", "sm"), "shrink-0")}
                    >
                      {t.action}
                    </Link>
                  ) : null)}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
