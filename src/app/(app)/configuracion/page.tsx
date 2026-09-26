"use client";

import { useState } from "react";
import useSWR from "swr";
import { Building2, KeyRound, LogOut, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { usePaginated } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import { clearOfflineData } from "@/lib/client/offline-db";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

type Tab = "perfil" | "negocio" | "usuarios" | "sucursales" | "bitacora";

export default function SettingsPage() {
  const { role } = useSession();
  const isOwner = role === "OWNER";
  const [tab, setTab] = useState<Tab>(isOwner ? "negocio" : "perfil");
  const tabs: { value: Tab; label: string }[] = isOwner
    ? [
        { value: "negocio", label: "Negocio" },
        { value: "perfil", label: "Mi cuenta" },
        { value: "usuarios", label: "Usuarios" },
        { value: "sucursales", label: "Sucursales" },
        { value: "bitacora", label: "Bitácora" },
      ]
    : [{ value: "perfil", label: "Mi cuenta" }];

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader title="Configuración" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "negocio" && isOwner && <BusinessSettings />}
      {tab === "perfil" && <ProfileSettings />}
      {tab === "usuarios" && isOwner && <MembersSettings />}
      {tab === "sucursales" && isOwner && <BranchesSettings />}
      {tab === "bitacora" && isOwner && <AuditLog />}
    </div>
  );
}

const CURRENCIES = ["MXN", "USD", "GTQ", "HNL", "NIO", "CRC", "PAB", "COP", "PEN", "CLP", "ARS", "BOB", "DOP", "EUR"];
const LOCALES = [
  { value: "es-MX", label: "México" },
  { value: "es-GT", label: "Guatemala" },
  { value: "es-HN", label: "Honduras" },
  { value: "es-SV", label: "El Salvador" },
  { value: "es-NI", label: "Nicaragua" },
  { value: "es-CR", label: "Costa Rica" },
  { value: "es-PA", label: "Panamá" },
  { value: "es-CO", label: "Colombia" },
  { value: "es-PE", label: "Perú" },
  { value: "es-CL", label: "Chile" },
  { value: "es-AR", label: "Argentina" },
  { value: "es-US", label: "Estados Unidos" },
  { value: "es-ES", label: "España" },
];
const TIMEZONES = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Monterrey",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Mazatlan",
  "America/Tijuana",
  "America/Guatemala",
  "America/Tegucigalpa",
  "America/El_Salvador",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
];

interface BusinessData {
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  locale: string;
  timezone: string;
  lowStockEmailAlerts: boolean;
  rfc: string | null;
  legalName: string | null;
  taxRegime: string | null;
  postalCode: string | null;
}

function BusinessSettings() {
  const { data, mutate } = useSWR<BusinessData>("/api/business", fetcher);
  if (!data) return <ListSkeleton rows={3} />;
  return <BusinessForm initial={data} onSaved={() => mutate()} />;
}

function BusinessForm({ initial, onSaved }: { initial: BusinessData; onSaved: () => Promise<unknown> | void }) {
  const toast = useToast();
  const [form, setForm] = useState<BusinessData>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BusinessData>(k: K, v: BusinessData[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/business", { method: "PUT", body: form });
      toast.success("Cambios guardados");
      await onSaved();
      // Moneda, idioma y zona horaria se aplican a toda la app.
      window.location.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Datos del negocio</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input label="Nombre" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          <Input label="Descripción" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Teléfono" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            <Input label="Dirección" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Select label="País (formato)" value={form.locale} onChange={(e) => set("locale", e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
            <Select label="Moneda" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Zona horaria" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("America/", "").replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
          <Checkbox
            label="Enviarme por correo las alertas diarias de bajo inventario y caducidad"
            checked={form.lowStockEmailAlerts}
            onChange={(e) => set("lowStockEmailAlerts", e.target.checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Datos fiscales (México · CFDI 4.0)</h2>
          <p className="text-sm text-slate-500">Necesarios para facturar. Cópialos de tu Constancia de Situación Fiscal.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="RFC" value={form.rfc ?? ""} onChange={(e) => set("rfc", e.target.value.toUpperCase())} />
            <Input label="C.P. (lugar de expedición)" inputMode="numeric" value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
          </div>
          <Input label="Razón social / nombre" value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} />
          <Select label="Régimen fiscal" value={form.taxRegime ?? ""} onChange={(e) => set("taxRegime", e.target.value)}>
            <option value="">Selecciona</option>
            <option value="626">626 · Régimen Simplificado de Confianza (RESICO)</option>
            <option value="612">612 · Personas Físicas con Actividades Empresariales</option>
            <option value="625">625 · Plataformas Tecnológicas</option>
            <option value="601">601 · General de Ley Personas Morales</option>
            <option value="621">621 · Incorporación Fiscal</option>
          </Select>
        </CardContent>
      </Card>

      <Button type="submit" loading={saving}>
        Guardar cambios
      </Button>
    </form>
  );
}

function ProfileSettings() {
  const { user } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/auth/change-password", { body: { currentPassword: current, newPassword: next } });
      toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
      setCurrent("");
      setNext("");
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function logoutAll() {
    if (!(await confirm({ title: "Cerrar sesión en todos los dispositivos", message: "Tendrás que volver a iniciar sesión en cada dispositivo.", confirmLabel: "Cerrar todas" })))
      return;
    try {
      await api("/api/auth/logout-all", { body: {} });
    } finally {
      await clearOfflineData();
      navigator.serviceWorker?.controller?.postMessage("clear-user-data");
      // Recarga completa a propósito: descarta el estado de la sesión cerrada.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{user.name}</h2>
          <p className="text-sm text-slate-500">{user.email}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Tema</p>
          <ThemeToggle />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> Cambiar contraseña
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <Input label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <Input label="Nueva contraseña" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required hint="Mínimo 8 caracteres" />
            <Button type="submit" loading={saving}>
              Actualizar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
      <Button variant="secondary" onClick={logoutAll}>
        <LogOut className="w-4 h-4" /> Cerrar sesión en todos los dispositivos
      </Button>
    </div>
  );
}

interface Member {
  id: string;
  role: "OWNER" | "CASHIER";
  user: { id: string; name: string; email: string };
}

function MembersSettings() {
  const { user } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, mutate } = useSWR<Member[]>("/api/business/members", fetcher);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "CASHIER" });
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<{ tempPassword: string | null; emailed: boolean; email: string } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ tempPassword: string | null; emailed: boolean }>("/api/business/members", { body: form });
      setOpen(false);
      setInvite({ ...res, email: form.email });
      setForm({ name: "", email: "", role: "CASHIER" });
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Member) {
    if (!(await confirm({ title: `Quitar a ${m.user.name}`, message: "Perderá el acceso a este negocio de inmediato.", danger: true, confirmLabel: "Quitar" }))) return;
    try {
      await api(`/api/business/members/${m.id}`, { method: "DELETE" });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">
          Los cajeros pueden vender, manejar caja y clientes, pero no ven costos, reportes ni configuración.
        </p>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="w-4 h-4" /> Agregar
        </Button>
      </div>
      {!data ? (
        <ListSkeleton rows={2} />
      ) : (
        data.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex justify-between items-center">
              <div>
                <p className="font-medium text-slate-900">{m.user.name}</p>
                <p className="text-xs text-slate-500">{m.user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "OWNER" ? "green" : "gray"}>{m.role === "OWNER" ? "Dueño" : "Cajero"}</Badge>
                {m.user.id !== user.id && (
                  <button aria-label={`Quitar a ${m.user.name}`} onClick={() => remove(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Agregar usuario">
        <form onSubmit={add} className="space-y-3">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Select label="Rol" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CASHIER">Cajero</option>
            <option value="OWNER">Dueño (acceso total)</option>
          </Select>
          <Button type="submit" className="w-full" loading={saving}>
            Agregar
          </Button>
        </form>
      </Modal>

      <Modal open={invite !== null} onClose={() => setInvite(null)} title="Usuario agregado">
        {invite && (
          <div className="space-y-3 text-sm">
            {invite.tempPassword ? (
              <>
                <p>
                  Comparte estos datos con la persona. Deberá cambiar la contraseña al entrar.
                  {invite.emailed && " También se los enviamos por correo."}
                </p>
                <p className="rounded-xl bg-slate-100 p-3 font-mono">
                  {invite.email}
                  <br />
                  {invite.tempPassword}
                </p>
                <p className="text-xs text-slate-500">Esta contraseña no se volverá a mostrar.</p>
              </>
            ) : (
              <p>La persona ya tenía cuenta; ahora puede elegir este negocio al iniciar sesión.</p>
            )}
            <Button className="w-full" onClick={() => setInvite(null)}>
              Listo
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BranchesSettings() {
  const { businesses, business } = useSession();
  const toast = useToast();
  const [name, setName] = useState("");
  const [copyCatalog, setCopyCatalog] = useState(true);
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/business/branches", { body: { name, copyCatalog } });
      toast.success("Sucursal creada. Cámbiate a ella desde el selector bajo el logo.");
      window.location.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Cada sucursal tiene su propio inventario, caja y ventas. En Reportes puedes ver el consolidado de todas.
      </p>
      {businesses.map((b) => (
        <Card key={b.id}>
          <CardContent className="flex justify-between items-center py-3">
            <span className="flex items-center gap-2 text-slate-900">
              <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" /> {b.name}
            </span>
            {b.id === business.id && <Badge tone="green">Actual</Badge>}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <Input label="Nueva sucursal" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Sucursal Centro" />
            <Checkbox label="Copiar el catálogo de productos (sin existencias)" checked={copyCatalog} onChange={(e) => setCopyCatalog(e.target.checked)} />
            <Button type="submit" loading={saving}>
              <Plus className="w-4 h-4" /> Crear sucursal
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  details: Record<string, unknown> | null;
  userName: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "sale.create": "Registró venta",
  "sale.cancel": "Canceló venta",
  "sale.return": "Registró devolución",
  "purchase.create": "Registró compra",
  "purchase.cancel": "Canceló compra",
  "product.create": "Creó producto",
  "product.update": "Editó producto",
  "product.archive": "Archivó producto",
  "stock.adjust": "Ajustó inventario",
  "cash.open": "Abrió caja",
  "cash.close": "Cerró caja",
  "cash.movement": "Movimiento de caja",
  "customer.create": "Creó cliente",
  "customer.update": "Editó cliente",
  "customer.payment": "Registró abono",
  "expense.create": "Registró gasto",
  "expense.delete": "Eliminó gasto",
  "member.add": "Agregó usuario",
  "member.remove": "Quitó usuario",
  "business.update": "Editó configuración",
  "branch.create": "Creó sucursal",
  "invoice.stamp": "Timbró factura",
  "invoice.cancel": "Canceló factura",
  "supplier.create": "Creó proveedor",
};

function AuditLog() {
  const fmt = useFormat();
  const list = usePaginated<AuditEntry>("/api/business/audit", { limit: 50 });
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Registro de quién hizo cada operación importante.
      </p>
      {list.isLoading ? (
        <ListSkeleton />
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-100 py-0">
            {list.items.map((e) => (
              <div key={e.id} className="py-2.5 text-sm flex justify-between gap-3">
                <span>
                  <span className="font-medium text-slate-900">{e.userName ?? "Sistema"}</span>{" "}
                  <span className="text-slate-600">{ACTION_LABELS[e.action] ?? e.action}</span>
                  {e.details && "folio" in e.details && <span className="text-slate-500"> #{String(e.details.folio)}</span>}
                  {e.details && "reason" in e.details && e.details.reason ? <span className="text-slate-500"> · {String(e.details.reason)}</span> : null}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{fmt.dateTime(e.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
    </div>
  );
}
