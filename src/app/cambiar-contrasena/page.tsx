"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/Input";

export default function ForcedPasswordChangePage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirmValue) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return router.push("/login");
        return setError(data.error || "No se pudo cambiar la contraseña");
      }
      router.push("/inicio");
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-surface-secondary">
      <form onSubmit={submit} className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
        <div className="text-center">
          <KeyRound className="w-8 h-8 text-brand-600 mx-auto mb-2" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-900">Crea tu contraseña</h1>
          <p className="text-sm text-slate-600">Por seguridad, cambia la contraseña temporal que recibiste.</p>
        </div>
        {error && (
          <div role="alert" className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}
        <PasswordInput label="Contraseña temporal" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <PasswordInput label="Nueva contraseña" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required hint="Mínimo 8 caracteres" />
        <PasswordInput label="Repite la nueva contraseña" autoComplete="new-password" value={confirmValue} onChange={(e) => setConfirmValue(e.target.value)} required />
        <Button type="submit" className="w-full" loading={loading}>
          Guardar y continuar
        </Button>
      </form>
    </main>
  );
}
