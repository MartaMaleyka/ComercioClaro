"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Copy, Download, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, Store } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { LanguageContext, useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import { ToastProvider, useToast } from "@/components/providers/ToastProvider";
import { ConfirmProvider, useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, ScrollArea } from "@/components/ui/Misc";

interface Props {
  language: string;
  email: string;
  reason: "admin" | "negocio" | null;
  backHref: string;
  continueHref: string;
}

/** Centro de seguridad de la cuenta (con sus proveedores: es una página fuera del panel y de la app). */
export function SecurityCenter(props: Props) {
  return (
    <LanguageContext.Provider value={props.language}>
      <ToastProvider>
        <ConfirmProvider>
          <Security {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </LanguageContext.Provider>
  );
}

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryLeft: number;
  required: "admin" | "business" | null;
}

interface SessionsData {
  sessions: {
    id: string;
    device: string;
    ip: string | null;
    createdAt: string;
    lastSeenAt: string;
    current: boolean;
  }[];
  history: {
    id: string;
    success: boolean;
    reason: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
  }[];
}

function Security({ email, reason, backHref, continueHref }: Props) {
  const tr = useText();
  const { data: mfa, error, mutate } = useSWR<MfaStatus>("/api/auth/mfa", fetcher);

  return (
    <main id="contenido" className="min-h-screen bg-surface-secondary px-4 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {tr("Volver")}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-brand-600 rounded-xl flex items-center justify-center">
            <Store className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{tr("Seguridad de tu cuenta")}</h1>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
        </div>

        {reason && !mfa?.enabled && (
          <p role="status" className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">
            {reason === "admin"
              ? tr("El panel de administración exige la verificación en dos pasos. Actívala para continuar.")
              : tr("Uno de tus negocios exige la verificación en dos pasos. Actívala para continuar.")}
          </p>
        )}

        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : !mfa ? (
          <ListSkeleton rows={3} />
        ) : (
          <MfaCard status={mfa} onChange={() => mutate()} continueHref={reason ? continueHref : null} />
        )}
        <SessionsCard />
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4" aria-hidden="true" /> {tr("Contraseña")}
            </h2>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {tr("Al cambiarla se cierran las sesiones de los demás dispositivos.")}
            </p>
            <Link
              href="/cambiar-contrasena"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {tr("Cambiar contraseña")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function RecoveryCodes({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const tr = useText();
  const toast = useToast();
  const text = codes.join("\n");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        {tr(
          "Guarda estos códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez para entrar si pierdes tu teléfono. No los volveremos a mostrar."
        )}
      </p>
      <ul aria-label={tr("Códigos de recuperación")} className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-slate-900">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            navigator.clipboard
              .writeText(text)
              .then(() => toast.success(tr("Códigos copiados")))
              .catch(() => toast.error(tr("No se pudo copiar")))
          }
        >
          <Copy className="w-4 h-4" aria-hidden="true" /> {tr("Copiar")}
        </Button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`ComercioClaro\n${text}\n`)}`}
          download="comercioclaro-codigos-de-recuperacion.txt"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" aria-hidden="true" /> {tr("Descargar")}
        </a>
        <Button size="sm" onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}

function MfaCard({
  status,
  onChange,
  continueHref,
}: {
  status: MfaStatus;
  onChange: () => void;
  continueHref: string | null;
}) {
  const tr = useText();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<"disable" | "regenerate" | null>(null);

  async function start() {
    setBusy(true);
    try {
      setSetup(await api<{ secret: string; qr: string }>("/api/auth/mfa/setup", { method: "POST" }));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ recoveryCodes: string[] }>("/api/auth/mfa/enable", { method: "POST", body: { code } });
      setCodes(res.recoveryCodes);
      setSetup(null);
      setCode("");
      toast.success(tr("Verificación en dos pasos activada"));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {tr("Verificación en dos pasos")}
          </h2>
          {status.enabled ? <Badge tone="green">{tr("Activa")}</Badge> : <Badge tone="amber">{tr("Inactiva")}</Badge>}
        </div>
        <p className="text-sm text-slate-500">
          {tr(
            "Además de tu contraseña, al entrar te pediremos un código de 6 dígitos de una app de autenticación (Google Authenticator, Microsoft Authenticator, Authy…)."
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {codes ? (
          <RecoveryCodes
            codes={codes}
            doneLabel={continueHref ? tr("Ya los guardé, continuar") : tr("Ya los guardé")}
            onDone={() => {
              setCodes(null);
              onChange();
              if (continueHref) window.location.assign(continueHref);
            }}
          />
        ) : status.enabled ? (
          <>
            <p className="text-sm text-slate-700">
              {tr("Activa desde el {date}. Te quedan {n} códigos de recuperación.", {
                date: status.enabledAt ? adminFmt.date(status.enabledAt) : "—",
                n: status.recoveryLeft,
              })}
            </p>
            {status.required && (
              <p className="text-xs text-slate-500">
                {status.required === "admin"
                  ? tr("Es obligatoria para los administradores de la plataforma.")
                  : tr("Uno de tus negocios la exige.")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setDialog("regenerate")}>
                {tr("Generar códigos de recuperación nuevos")}
              </Button>
              {!status.required && (
                <Button variant="secondary" onClick={() => setDialog("disable")}>
                  {tr("Desactivar")}
                </Button>
              )}
            </div>
          </>
        ) : setup ? (
          <form onSubmit={confirmCode} className="space-y-4">
            <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">
              <li>{tr("Abre tu app de autenticación y agrega una cuenta nueva.")}</li>
              <li>{tr("Escanea este código QR o escribe la clave a mano.")}</li>
              <li>{tr("Escribe el código de 6 dígitos que muestra la app.")}</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el servidor (data URL) */}
              <img
                src={setup.qr}
                alt={tr("Código QR para tu app de autenticación")}
                width={180}
                height={180}
                className="rounded-xl border border-slate-200 bg-white p-2"
              />
              <div className="space-y-1">
                <p className="text-xs text-slate-500">{tr("Clave para escribir a mano")}</p>
                <p className="font-mono text-sm text-slate-900 break-all" aria-label={tr("Clave para escribir a mano")}>
                  {setup.secret.match(/.{1,4}/g)?.join(" ")}
                </p>
              </div>
            </div>
            <div className="max-w-56">
              <Input
                label={tr("Código de 6 dígitos")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                {tr("Activar")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                {tr("Cancelar")}
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={start} loading={busy}>
            <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {tr("Activar la verificación en dos pasos")}
          </Button>
        )}
      </CardContent>
      {dialog && (
        <MfaDialog
          kind={dialog}
          onClose={() => setDialog(null)}
          onDone={(newCodes) => {
            setDialog(null);
            if (newCodes) setCodes(newCodes);
            onChange();
          }}
        />
      )}
    </Card>
  );
}

function MfaDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: "disable" | "regenerate";
  onClose: () => void;
  onDone: (codes?: string[]) => void;
}) {
  const tr = useText();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (kind === "disable") {
        await api("/api/auth/mfa/disable", { method: "POST", body: { password, code } });
        toast.success(tr("Verificación en dos pasos desactivada"));
        onDone();
      } else {
        const res = await api<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery", {
          method: "POST",
          body: { code },
        });
        onDone(res.recoveryCodes);
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "disable" ? tr("Desactivar la verificación en dos pasos") : tr("Códigos de recuperación nuevos")}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {kind === "disable"
            ? tr("Tu cuenta quedará protegida solo con la contraseña.")
            : tr("Los códigos anteriores dejarán de servir.")}
        </p>
        {kind === "disable" && (
          <Input
            label={tr("Contraseña")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        )}
        <Input
          label={tr("Código de la app o de recuperación")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button type="submit" variant={kind === "disable" ? "danger" : "primary"} loading={busy}>
            {kind === "disable" ? tr("Desactivar") : tr("Generar")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SessionsCard() {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<SessionsData>("/api/auth/sessions", fetcher);

  const reasonLabel: Record<string, string> = {
    OK: tr("Correcto"),
    BAD_PASSWORD: tr("Contraseña incorrecta"),
    UNKNOWN_EMAIL: tr("Correo desconocido"),
    BLOCKED: tr("Usuario bloqueado"),
    MFA_REQUIRED: tr("Contraseña correcta, faltó el código"),
    MFA_FAILED: tr("Código incorrecto"),
  };

  async function revoke(id: string) {
    try {
      await api(`/api/auth/sessions/${id}`, { method: "DELETE" });
      toast.success(tr("Sesión cerrada"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function revokeOthers() {
    const ok = await confirm({
      title: tr("¿Cerrar las sesiones de los demás dispositivos?"),
      message: tr("Tendrán que iniciar sesión otra vez. Esta sesión sigue abierta."),
      confirmLabel: tr("Cerrar las demás"),
    });
    if (!ok) return;
    try {
      const res = await api<{ revoked: number }>("/api/auth/sessions/others", { method: "POST" });
      toast.success(tr("{n} sesión(es) cerrada(s)", { n: res.revoked }));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <MonitorSmartphone className="w-4 h-4" aria-hidden="true" /> {tr("Sesiones abiertas")}
            </h2>
            {data && data.sessions.length > 1 && (
              <Button size="sm" variant="secondary" onClick={revokeOthers}>
                <LogOut className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar las demás")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <ErrorState error={error} onRetry={() => mutate()} />
          ) : !data ? (
            <ListSkeleton rows={2} />
          ) : data.sessions.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("No hay otras sesiones registradas.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.sessions.map((s) => (
                <li key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-medium text-slate-900">{s.device}</span>
                    {s.current && (
                      <Badge tone="green" className="ml-2">
                        {tr("Este dispositivo")}
                      </Badge>
                    )}
                    <span className="block text-xs text-slate-500">
                      {tr("IP {ip} · última actividad {date}", {
                        ip: s.ip ?? "—",
                        date: adminFmt.dateTime(s.lastSeenAt),
                      })}
                    </span>
                  </span>
                  {!s.current && (
                    <Button size="sm" variant="secondary" onClick={() => revoke(s.id)}>
                      {tr("Cerrar sesión")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Actividad reciente")}</h2>
          <p className="text-sm text-slate-500">
            {tr("Últimos inicios de sesión en tu cuenta, correctos y fallidos.")}
          </p>
        </CardHeader>
        <CardContent>
          {!data ? (
            <ListSkeleton rows={3} />
          ) : data.history.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("Sin actividad registrada.")}</p>
          ) : (
            <ScrollArea label={tr("Actividad reciente")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      {tr("Fecha")}
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      {tr("Resultado")}
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{adminFmt.dateTime(h.createdAt)}</td>
                      <td
                        className={
                          h.success ? "py-1.5 pr-3 text-brand-700 dark:text-brand-300" : "py-1.5 pr-3 text-red-700"
                        }
                      >
                        {reasonLabel[h.reason] ?? h.reason}
                      </td>
                      <td className="py-1.5 text-slate-600">{h.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </>
  );
}
