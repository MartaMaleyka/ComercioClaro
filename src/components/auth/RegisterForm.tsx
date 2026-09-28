"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Store } from "lucide-react";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/business-types";
import { isCommonPassword } from "@/lib/password-policy";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, PasswordInput, Select } from "@/components/ui/Input";

export interface ChosenPlan {
  code: string;
  name: string;
  priceMonthly: number;
  currency: string;
  trialDays: number;
}

/** Fortaleza aproximada de la contraseña para orientar (el servidor exige el mínimo). */
function passwordStrength(value: string) {
  if (value.length === 0) return null;
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (value.length < 8) return { label: "Muy corta", tone: "text-red-600" };
  if (isCommonPassword(value))
    return { label: "Muy común: es de las primeras que se prueban, elige otra", tone: "text-red-600" };
  if (score <= 2) return { label: "Débil: agrega números, mayúsculas o símbolos", tone: "text-amber-700" };
  if (score === 3) return { label: "Aceptable", tone: "text-slate-600" };
  return { label: "Fuerte", tone: "text-brand-700" };
}

export function RegisterForm({ plan }: { plan: ChosenPlan | null }) {
  const router = useRouter();
  // Cuándo se abrió el formulario (anti-bots): se toma una sola vez.
  const [openedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    businessName: "",
    businessType: "MINISUPER" as BusinessType,
    phone: "",
    country: "PA",
    acceptTerms: false,
    website: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const type = BUSINESS_TYPES.find((t) => t.key === form.businessType);
  const strength = passwordStrength(form.password);

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.acceptTerms) {
      setError("Para crear la cuenta debes aceptar los términos y el aviso de privacidad.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone || null,
          plan: plan?.code ?? null,
          elapsedMs: Date.now() - openedAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear la cuenta");
        return;
      }
      router.push(data.next || "/inicio");
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const price = plan
    ? new Intl.NumberFormat("es-PA", { style: "currency", currency: plan.currency }).format(plan.priceMonthly)
    : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-brand-50 to-surface-secondary">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Store className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Crea tu cuenta</h1>
          <p className="text-slate-600 mt-1">Empieza a organizar tu negocio hoy</p>
        </div>

        {plan && (
          <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm flex items-center justify-between gap-3">
            <p className="text-slate-700">
              Plan <strong className="text-slate-900">{plan.name}</strong>
              {plan.trialDays > 0
                ? ` · ${plan.trialDays} días gratis, luego ${price}/mes`
                : plan.priceMonthly > 0
                  ? ` · ${price}/mes`
                  : " · gratis"}
            </p>
            <Link href="/#precios" className="shrink-0 font-medium text-brand-700 dark:text-brand-300 underline">
              Cambiar
            </Link>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4"
        >
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">
              {error}
            </div>
          )}
          <Input
            label="Tu nombre"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="María García"
            autoComplete="name"
            required
          />
          <Input
            label="Nombre de tu negocio"
            value={form.businessName}
            onChange={(e) => update("businessName", e.target.value)}
            placeholder="Minisúper La Esperanza"
            autoComplete="organization"
            required
          />
          <Select
            label="Tipo de negocio"
            value={form.businessType}
            onChange={(e) => update("businessType", e.target.value as BusinessType)}
            hint={type?.hint ? `Te sugerimos: ${type.hint}` : undefined}
          >
            {BUSINESS_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="País" value={form.country} onChange={(e) => update("country", e.target.value)}>
              <option value="PA">Panamá</option>
              <option value="MX">México</option>
              <option value="OTHER">Otro país</option>
            </Select>
            <Input
              label="Teléfono o WhatsApp"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="6123-4567"
              autoComplete="tel"
              hint="Opcional"
            />
          </div>
          <Input
            label="Correo electrónico"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="tu@correo.com"
            autoComplete="email"
            hint="Te enviaremos un enlace para confirmarlo."
            required
          />
          <div className="space-y-1">
            <PasswordInput
              label="Contraseña"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
            />
            {strength && (
              <p className={`text-xs ${strength.tone}`} aria-live="polite">
                {strength.label}
              </p>
            )}
          </div>

          {/* Campo trampa para bots: las personas no lo ven ni lo llenan. */}
          <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
            <label>
              Sitio web
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
              />
            </label>
          </div>

          <Checkbox
            checked={form.acceptTerms}
            onChange={(e) => update("acceptTerms", e.target.checked)}
            label={
              <span>
                Acepto los{" "}
                <Link href="/terminos" target="_blank" className="text-brand-700 dark:text-brand-300 underline">
                  términos de uso
                </Link>{" "}
                y el{" "}
                <Link href="/privacidad" target="_blank" className="text-brand-700 dark:text-brand-300 underline">
                  aviso de privacidad
                </Link>
              </span>
            }
          />
          <Button type="submit" className="w-full" loading={loading}>
            Crear cuenta
          </Button>
        </form>

        <p className="text-center text-sm text-slate-600 mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-brand-600 font-medium hover:text-brand-700">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
