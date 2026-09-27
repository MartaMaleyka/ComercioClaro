"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MailCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Confirmación del correo. Se confirma con un botón (no al abrir la página) para que los
 * lectores de correo que revisan los enlaces no gasten el enlace.
 */
function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function confirm() {
    setState("loading");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "No pudimos confirmar tu correo");
        setState("error");
        return;
      }
      setMessage(`Listo: confirmamos ${data.email}.`);
      setState("done");
    } catch {
      setMessage("Error de conexión. Intenta de nuevo.");
      setState("error");
    }
  }

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4 text-center">
      {!token ? (
        <p role="alert" className="text-sm text-red-600">
          Falta el enlace de confirmación. Ábrelo desde el correo que te enviamos.
        </p>
      ) : state === "done" ? (
        <>
          <MailCheck className="w-10 h-10 mx-auto text-brand-600" aria-hidden="true" />
          <p role="status" className="text-slate-700">
            {message}
          </p>
          <Link
            href="/inicio"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-brand-700"
          >
            Ir a mi negocio
          </Link>
        </>
      ) : (
        <>
          <p className="text-slate-700">
            Confirma que este correo es tuyo para poder recuperar tu contraseña y recibir avisos.
          </p>
          {state === "error" && (
            <p role="alert" className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">
              {message}
            </p>
          )}
          <Button className="w-full" onClick={confirm} loading={state === "loading"}>
            Confirmar mi correo
          </Button>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-brand-50 to-surface-secondary">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Store className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Confirma tu correo</h1>
        </div>
        <Suspense>
          <VerifyEmail />
        </Suspense>
      </div>
    </main>
  );
}
