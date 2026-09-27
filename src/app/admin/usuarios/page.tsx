"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Activity, AtSign, KeyRound, LogOut, ShieldCheck, ShieldOff, ShieldX, UserCheck, UserX } from "lucide-react";
import { api, fetcher, withQuery } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, PageHeader, ScrollArea } from "@/components/ui/Misc";
import { SegmentedControl } from "@/components/ui/Switch";

interface UserRow {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  totpEnabledAt: string | null;
  memberships: { role: "OWNER" | "CASHIER"; business: { id: string; name: string } }[];
}

type Filter = "all" | "admins" | "noMfa" | "unverified" | "blocked";

export default function AdminUsersPage() {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, mutate } = useSWR<UserRow[]>(withQuery("/api/admin/users", { search: query }), fetcher);
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activity, setActivity] = useState<UserRow | null>(null);
  const [changingEmail, setChangingEmail] = useState<UserRow | null>(null);
  const rows = (data ?? []).filter((u) =>
    filter === "admins"
      ? u.isSuperAdmin
      : filter === "noMfa"
        ? !u.totpEnabledAt
        : filter === "unverified"
          ? !u.emailVerifiedAt
          : filter === "blocked"
            ? u.disabledAt !== null
            : true
  );

  async function run(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast.success(message);
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function toggleAdmin(u: UserRow) {
    const ok = await confirm({
      title: u.isSuperAdmin
        ? tr("¿Quitar a {name} como administrador?", { name: u.name })
        : tr("¿Hacer a {name} administrador de la plataforma?", { name: u.name }),
      message: u.isSuperAdmin ? undefined : tr("Podrá ver y cambiar todos los negocios, planes, pagos y usuarios."),
      danger: !u.isSuperAdmin,
    });
    if (ok)
      await run(
        () => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isSuperAdmin: !u.isSuperAdmin } }),
        tr("Cambios guardados")
      );
  }

  async function toggleDisabled(u: UserRow) {
    const disabling = !u.disabledAt;
    const ok = await confirm({
      title: disabling ? tr("¿Bloquear a {name}?", { name: u.name }) : tr("¿Desbloquear a {name}?", { name: u.name }),
      message: disabling ? tr("No podrá iniciar sesión y se cierran sus sesiones abiertas.") : undefined,
      danger: disabling,
    });
    if (ok)
      await run(
        () => api(`/api/admin/users/${u.id}`, { method: "PATCH", body: { disabled: disabling } }),
        disabling ? tr("Usuario bloqueado") : tr("Usuario desbloqueado")
      );
  }

  async function revoke(u: UserRow) {
    await run(() => api(`/api/admin/users/${u.id}/sessions`, { method: "POST" }), tr("Sesiones cerradas"));
  }

  async function resetMfa(u: UserRow) {
    const ok = await confirm({
      title: tr("¿Quitar la verificación en dos pasos de {name}?", { name: u.name }),
      message: tr(
        "Úsalo solo si perdió su teléfono y comprobaste que es la persona. Se cierran sus sesiones y le avisamos por correo."
      ),
      confirmLabel: tr("Quitar dos pasos"),
      danger: true,
    });
    if (ok)
      await run(
        () => api(`/api/admin/users/${u.id}/mfa-reset`, { method: "POST" }),
        tr("Verificación en dos pasos quitada")
      );
  }

  async function resetPassword(u: UserRow) {
    const ok = await confirm({
      title: tr("¿Generar una contraseña temporal para {name}?", { name: u.name }),
      message: tr("La contraseña actual deja de funcionar y deberá cambiarla al entrar."),
    });
    if (!ok) return;
    try {
      const res = await api<{ tempPassword: string }>(`/api/admin/users/${u.id}/password`, { method: "POST" });
      setPassword({ email: u.email, value: res.tempPassword });
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={tr("Usuarios")} description={tr("Acceso, bloqueo y administradores de la plataforma")} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Input
          label={tr("Buscar por nombre o correo")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setQuery(search.trim())}
        />
        <SegmentedControl<Filter>
          label={tr("Mostrar")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: tr("Todos") },
            { value: "admins", label: tr("Administradores") },
            { value: "noMfa", label: tr("Sin dos pasos") },
            { value: "unverified", label: tr("Correo sin confirmar") },
            { value: "blocked", label: tr("Bloqueados") },
          ]}
        />
      </form>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className="space-y-2">
          {rows.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 flex flex-wrap items-center gap-2">
                    {u.name}
                    {u.isSuperAdmin && <Badge tone="purple">{tr("Administrador")}</Badge>}
                    {u.disabledAt && <Badge tone="red">{tr("Bloqueado")}</Badge>}
                    {u.totpEnabledAt ? (
                      <Badge tone="green">{tr("Dos pasos")}</Badge>
                    ) : u.isSuperAdmin ? (
                      <Badge tone="amber">{tr("Sin dos pasos")}</Badge>
                    ) : null}
                    {!u.emailVerifiedAt && <Badge tone="amber">{tr("Correo sin confirmar")}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {u.email} · {tr("Desde el {date}", { date: adminFmt.date(u.createdAt) })} ·{" "}
                    {u.lastLoginAt
                      ? tr("Último acceso: {date}", { date: adminFmt.dateTime(u.lastLoginAt) })
                      : tr("Sin accesos registrados")}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {u.memberships.length === 0
                      ? tr("Sin negocios")
                      : u.memberships
                          .map((m) => `${m.business.name} (${m.role === "OWNER" ? tr("Dueño") : tr("Cajero")})`)
                          .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setActivity(u)}>
                    <Activity className="w-4 h-4" aria-hidden="true" /> {tr("Actividad")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setChangingEmail(u)}>
                    <AtSign className="w-4 h-4" aria-hidden="true" /> {tr("Cambiar correo")}
                  </Button>
                  {u.totpEnabledAt && (
                    <Button size="sm" variant="secondary" onClick={() => resetMfa(u)}>
                      <ShieldX className="w-4 h-4" aria-hidden="true" /> {tr("Quitar dos pasos")}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => toggleAdmin(u)}>
                    {u.isSuperAdmin ? (
                      <ShieldOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    )}
                    {u.isSuperAdmin ? tr("Quitar administrador") : tr("Hacer administrador")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => toggleDisabled(u)}>
                    {u.disabledAt ? (
                      <UserCheck className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <UserX className="w-4 h-4" aria-hidden="true" />
                    )}
                    {u.disabledAt ? tr("Desbloquear") : tr("Bloquear")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => revoke(u)}>
                    <LogOut className="w-4 h-4" aria-hidden="true" /> {tr("Cerrar sesiones")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resetPassword(u)}>
                    <KeyRound className="w-4 h-4" aria-hidden="true" /> {tr("Contraseña temporal")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && <p className="text-sm text-slate-500">{tr("No hay usuarios con esa búsqueda.")}</p>}
        </div>
      )}
      {activity && <ActivityModal user={activity} onClose={() => setActivity(null)} />}
      {changingEmail && (
        <EmailModal
          user={changingEmail}
          onClose={() => setChangingEmail(null)}
          onSaved={() => {
            setChangingEmail(null);
            mutate();
          }}
        />
      )}
      <Modal open={password !== null} onClose={() => setPassword(null)} title={tr("Contraseña temporal")}>
        {password && (
          <div className="space-y-3 text-sm">
            <p>{tr("Entrégala al usuario. Se muestra una sola vez y deberá cambiarla al entrar.")}</p>
            <p className="rounded-xl bg-slate-50 p-3 font-mono">
              {password.email}
              <br />
              {password.value}
            </p>
            <Button className="w-full" onClick={() => setPassword(null)}>
              {tr("Listo")}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

interface Security {
  emailVerified: boolean;
  mfaEnabled: boolean;
  memberships: { role: "OWNER" | "CASHIER"; business: { id: string; name: string; status: string } }[];
  sessions: { id: string; device: string; ip: string | null; createdAt: string; lastSeenAt: string }[];
  history: { id: string; success: boolean; reason: string; ip: string | null; device: string; createdAt: string }[];
}

/** Negocios, sesiones abiertas (se pueden cerrar una por una) e inicios de sesión de un usuario. */
function ActivityModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const tr = useText();
  const toast = useToast();
  const { data, mutate } = useSWR<Security>(`/api/admin/users/${user.id}/security`, fetcher);
  const reasonLabel: Record<string, string> = {
    OK: tr("Correcto"),
    BAD_PASSWORD: tr("Contraseña incorrecta"),
    UNKNOWN_EMAIL: tr("Correo desconocido"),
    BLOCKED: tr("Usuario bloqueado"),
    MFA_REQUIRED: tr("Contraseña correcta, faltó el código"),
    MFA_FAILED: tr("Código incorrecto"),
  };

  async function revoke(sid: string) {
    try {
      await api(`/api/admin/users/${user.id}/sessions/${sid}`, { method: "DELETE" });
      toast.success(tr("Sesión cerrada"));
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Actividad de {name}", { name: user.name })} size="lg">
      {!data ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-5 text-sm">
          <section aria-labelledby="actividad-negocios">
            <h3 id="actividad-negocios" className="font-semibold text-slate-900 mb-1">
              {tr("Negocios")}
            </h3>
            {data.memberships.length === 0 ? (
              <p className="text-slate-500">{tr("Sin negocios")}</p>
            ) : (
              <ul className="space-y-1">
                {data.memberships.map((m) => (
                  <li key={m.business.id}>
                    <Link
                      href={`/admin/negocios/${m.business.id}`}
                      className="text-brand-700 dark:text-brand-300 underline"
                    >
                      {m.business.name}
                    </Link>{" "}
                    · {m.role === "OWNER" ? tr("Dueño") : tr("Cajero")}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="actividad-sesiones">
            <h3 id="actividad-sesiones" className="font-semibold text-slate-900 mb-1">
              {tr("Sesiones abiertas")}
            </h3>
            {data.sessions.length === 0 ? (
              <p className="text-slate-500">{tr("Sin sesiones abiertas.")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.sessions.map((s) => (
                  <li key={s.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {s.device}
                      <span className="block text-xs text-slate-500">
                        {tr("IP {ip} · última actividad {date}", {
                          ip: s.ip ?? "—",
                          date: adminFmt.dateTime(s.lastSeenAt),
                        })}
                      </span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => revoke(s.id)}>
                      {tr("Cerrar sesión")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="actividad-historial">
            <h3 id="actividad-historial" className="font-semibold text-slate-900 mb-1">
              {tr("Inicios de sesión")}
            </h3>
            {data.history.length === 0 ? (
              <p className="text-slate-500">{tr("Sin actividad registrada.")}</p>
            ) : (
              <ScrollArea label={tr("Inicios de sesión")}>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {tr("Fecha")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {tr("Resultado")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {tr("Dispositivo")}
                      </th>
                      <th scope="col" className="py-1 font-medium">
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
                        <td className="py-1.5 pr-3">{h.device}</td>
                        <td className="py-1.5 text-slate-600">{h.ip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Cambiar el correo: queda sin confirmar, se cierran sus sesiones y se avisa a ambos correos. */
function EmailModal({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/admin/users/${user.id}/email`, { method: "POST", body: { email } });
      toast.success(tr("Correo cambiado: le enviamos el enlace para confirmarlo"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Cambiar el correo de {name}", { name: user.name })}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {tr(
            "El correo nuevo queda sin confirmar hasta que abra el enlace. Se cierran sus sesiones y avisamos al correo anterior."
          )}
        </p>
        <Input
          label={tr("Correo nuevo")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button type="submit" loading={saving}>
            {tr("Cambiar correo")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
