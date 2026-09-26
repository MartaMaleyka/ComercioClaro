"use client";

import { useState } from "react";
import useSWR from "swr";
import { KeyRound, LogOut, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
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
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

interface UserRow {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
  memberships: { role: "OWNER" | "CASHIER"; business: { id: string; name: string } }[];
}

export default function AdminUsersPage() {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, mutate } = useSWR<UserRow[]>(withQuery("/api/admin/users", { search: query }), fetcher);
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null);

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
        className="max-w-md"
      >
        <Input
          label={tr("Buscar por nombre o correo")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setQuery(search.trim())}
        />
      </form>
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className="space-y-2">
          {data.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 flex flex-wrap items-center gap-2">
                    {u.name}
                    {u.isSuperAdmin && <Badge tone="purple">{tr("Administrador")}</Badge>}
                    {u.disabledAt && <Badge tone="red">{tr("Bloqueado")}</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {u.email} · {tr("Desde el {date}", { date: adminFmt.date(u.createdAt) })}
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
          {data.length === 0 && <p className="text-sm text-slate-500">{tr("No hay usuarios con esa búsqueda.")}</p>}
        </div>
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
