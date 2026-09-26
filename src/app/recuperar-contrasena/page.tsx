"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Store, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo procesar la solicitud");
        return;
      }
      setMessage(data.message);
      setDone(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setMessage("¡Contraseña actualizada! Ya puedes iniciar sesión.");
      setDone(true);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al inicio de sesión
      </Link>

      <div className="text-center mb-8">
        <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Store className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          {token ? "Nueva contraseña" : "Recuperar contraseña"}
        </h1>
        <p className="text-slate-600 mt-1">
          {token
            ? "Ingresa tu nueva contraseña"
            : "Te enviaremos instrucciones a tu correo"}
        </p>
      </div>

      {done && message ? (
        <div className="bg-surface rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <p className="text-slate-700 mb-4">{message}</p>
          <Link href="/login">
            <Button>Ir a iniciar sesión</Button>
          </Link>
        </div>
      ) : (
        <form
          onSubmit={token ? handleReset : handleRequest}
          className="bg-surface rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4"
        >
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>
          )}
          {token ? (
            <Input
              label="Nueva contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
            />
          ) : (
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
            />
          )}
          <Button type="submit" className="w-full" loading={loading}>
            {token ? "Actualizar contraseña" : "Enviar instrucciones"}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-b from-brand-50 to-surface-secondary">
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
