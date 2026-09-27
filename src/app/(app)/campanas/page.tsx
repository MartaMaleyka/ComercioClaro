"use client";

import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Megaphone, MessageCircle, Plus, Send, Ticket } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { whatsappLink } from "@/lib/client/receipt";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { ErrorState, ListSkeleton, PageHeader, Stat } from "@/components/ui/Misc";

type SegmentType = "ALL" | "BIRTHDAY" | "INACTIVE" | "FREQUENT" | "OVERDUE" | "TAG";

interface Coupon {
  id: string;
  code: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  minPurchase: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  redemptions?: number;
  salesTotal?: number;
  discountTotal?: number;
}

interface CampaignRow {
  id: string;
  name: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
  coupon: Coupon | null;
  total: number;
  sent: number;
  failed: number;
}

interface CampaignDetail {
  id: string;
  name: string;
  message: string;
  status: "DRAFT" | "SENT";
  coupon: Coupon | null;
  apiEnabled: boolean;
  recipients: {
    id: string;
    phone: string;
    message: string;
    status: "PENDING" | "SENT" | "FAILED";
    error: string | null;
    customer: { name: string };
  }[];
  results: {
    attributionDays: number;
    buyers: number;
    sales: number;
    salesTotal: number;
    redemptions: number;
    redemptionTotal: number;
    discountTotal: number;
    conversion: number;
  };
}

const SEGMENTS: { value: SegmentType; label: string }[] = [
  { value: "BIRTHDAY", label: "Cumpleaños del mes" },
  { value: "INACTIVE", label: "No han vuelto" },
  { value: "FREQUENT", label: "Clientes frecuentes" },
  { value: "OVERDUE", label: "Con fiado vencido" },
  { value: "TAG", label: "Por etiqueta" },
  { value: "ALL", label: "Todos los que aceptaron" },
];

export default function CampaignsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Campaigns />
    </Suspense>
  );
}

function Campaigns() {
  const tr = useText();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "cupones" ? "coupons" : "campaigns";
  return (
    <div className="space-y-5">
      <PageHeader
        title={tr("Campañas")}
        description={tr("Mensajes por WhatsApp a tus clientes y cupones para que vuelvan")}
      />
      <Tabs
        label={tr("Campañas")}
        tabs={[
          { value: "campaigns", label: tr("Campañas") },
          { value: "coupons", label: tr("Cupones") },
        ]}
        value={tab}
        onChange={(t) => router.replace(t === "coupons" ? "/campanas?tab=cupones" : "/campanas")}
      />
      {tab === "coupons" ? <CouponsTab /> : <CampaignsTab />}
    </div>
  );
}

function CampaignsTab() {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<CampaignRow[]>("/api/campaigns", fetcher);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-sm text-slate-600">
          {tr("Solo reciben campañas los clientes que aceptaron recibir promociones (Ley 81 de protección de datos).")}
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Nueva campaña")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={tr("Sin campañas")}
          description={tr("Felicita a tus clientes en su cumpleaños o invita a volver a los que no han regresado.")}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {c.name}{" "}
                      <Badge tone={c.status === "SENT" ? "green" : "amber"}>
                        {c.status === "SENT" ? tr("Enviada") : tr("Por enviar")}
                      </Badge>
                    </p>
                    <p className="text-xs text-slate-500">
                      {fmt.date(c.createdAt)} · {tr("{sent} de {total} enviados", { sent: c.sent, total: c.total })}
                      {c.coupon && ` · ${tr("cupón {code}", { code: c.coupon.code })}`}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setOpen(c.id)}>
                    {tr("Abrir")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <CampaignForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            mutate();
            setOpen(id);
          }}
        />
      )}
      {open && <CampaignView id={open} onClose={() => setOpen(null)} onChanged={() => mutate()} />}
    </div>
  );
}

function CampaignForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const tr = useText();
  const toast = useToast();
  const { data: coupons } = useSWR<Coupon[]>("/api/coupons", fetcher);
  const [name, setName] = useState("");
  const [type, setType] = useState<SegmentType>("BIRTHDAY");
  const [days, setDays] = useState("30");
  const [visits, setVisits] = useState("4");
  const [tag, setTag] = useState("");
  const [couponId, setCouponId] = useState("");
  const [message, setMessage] = useState(
    "¡Hola {nombre}! Este mes es tu cumpleaños y te queremos consentir: usa el cupón {cupón} en tu próxima compra."
  );
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const segment =
    type === "INACTIVE"
      ? { type, days: Number(days) || 30 }
      : type === "FREQUENT"
        ? { type, visits: Number(visits) || 4, days: 90 }
        : type === "TAG"
          ? { type, tag }
          : { type };
  const segmentKey = JSON.stringify(segment);

  useEffect(() => {
    if (type === "TAG" && !tag.trim()) return;
    const controller = new AbortController();
    api<{ count: number; sample: string[] }>("/api/campaigns/preview", {
      body: JSON.parse(segmentKey),
      signal: controller.signal,
    })
      .then(setPreview)
      .catch(() => {});
    return () => controller.abort();
  }, [segmentKey, type, tag]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const campaign = await api<{ id: string }>("/api/campaigns", {
        body: { name, message, segment, couponId: couponId || null },
      });
      toast.success(tr("Campaña creada"));
      onSaved(campaign.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Nueva campaña")} size="lg">
      <form onSubmit={save} className="space-y-3">
        <Input
          label={tr("Nombre")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr("Ej. Cumpleaños de octubre")}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label={tr("A quién")} value={type} onChange={(e) => setType(e.target.value as SegmentType)}>
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {tr(s.label)}
              </option>
            ))}
          </Select>
          {type === "INACTIVE" && (
            <Input
              label={tr("Sin comprar hace más de (días)")}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          )}
          {type === "FREQUENT" && (
            <Input
              label={tr("Compras en los últimos 90 días (mínimo)")}
              inputMode="numeric"
              value={visits}
              onChange={(e) => setVisits(e.target.value)}
            />
          )}
          {type === "TAG" && (
            <Input label={tr("Etiqueta")} value={tag} onChange={(e) => setTag(e.target.value)} required />
          )}
        </div>
        <p role="status" className="text-sm text-slate-600">
          {preview
            ? tr("{n} clientes recibirán el mensaje", { n: preview.count }) +
              (preview.sample.length > 0
                ? `: ${preview.sample.join(", ")}${preview.count > preview.sample.length ? "…" : ""}`
                : "")
            : tr("Calculando destinatarios…")}
        </p>
        <Select label={tr("Cupón (opcional)")} value={couponId} onChange={(e) => setCouponId(e.target.value)}>
          <option value="">{tr("Sin cupón")}</option>
          {coupons
            ?.filter((c) => c.active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
        </Select>
        <Textarea
          label={tr("Mensaje")}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          hint={tr("Puedes usar {nombre}, {puntos} y {cupón}; se reemplazan por los datos de cada cliente.")}
          required
        />
        <Button type="submit" className="w-full" loading={saving} disabled={preview?.count === 0}>
          {tr("Crear campaña")}
        </Button>
      </form>
    </Modal>
  );
}

function CampaignView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<CampaignDetail>(`/api/campaigns/${id}`, fetcher);
  const [sending, setSending] = useState(false);

  async function markSent(recipientId: string) {
    try {
      await api(`/api/campaigns/recipients/${recipientId}`, { body: {} });
      mutate();
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function sendAll() {
    setSending(true);
    try {
      const result = await api<{ sent: number; failed: number }>(`/api/campaigns/${id}/send`, { body: {} });
      toast.success(tr("{sent} enviados, {failed} con error", result));
      mutate();
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={data?.name ?? tr("Campaña")} size="lg">
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={tr("Compraron")}
              value={data.results.buyers}
              hint={tr("{n}% de los destinatarios", { n: data.results.conversion })}
            />
            <Stat
              label={tr("Ventas atribuidas")}
              value={fmt.money(data.results.salesTotal)}
              hint={tr("{n} ventas en {days} días", { n: data.results.sales, days: data.results.attributionDays })}
            />
            <Stat label={tr("Canjes del cupón")} value={data.results.redemptions} />
            <Stat label={tr("Descuento otorgado")} value={fmt.money(data.results.discountTotal)} />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-slate-600">
              {data.apiEnabled
                ? tr("La API de WhatsApp Business está configurada: puedes enviar todos a la vez.")
                : tr("Envío asistido: abre cada mensaje en WhatsApp, envíalo y márcalo como enviado.")}
            </p>
            {data.apiEnabled && (
              <Button onClick={sendAll} loading={sending}>
                <Send className="w-4 h-4" aria-hidden="true" /> {tr("Enviar pendientes")}
              </Button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {data.recipients.map((r) => (
              <li key={r.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {r.customer.name}{" "}
                    {r.status === "SENT" ? (
                      <Badge tone="green">{tr("Enviado")}</Badge>
                    ) : r.status === "FAILED" ? (
                      <Badge tone="red">{tr("Error")}</Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500 break-words">{r.message}</p>
                  {r.error && <p className="text-xs text-red-600">{r.error}</p>}
                </div>
                {r.status !== "SENT" && (
                  <div className="flex gap-1 shrink-0">
                    <a
                      href={whatsappLink(r.message, r.phone, business.locale)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={tr("Abrir WhatsApp para {name}", { name: r.customer.name })}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-brand-700 dark:text-brand-300"
                    >
                      <MessageCircle className="w-4 h-4" aria-hidden="true" />
                    </a>
                    <button
                      aria-label={tr("Marcar enviado a {name}", { name: r.customer.name })}
                      onClick={() => markSent(r.id)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-600"
                    >
                      <Check className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function CouponsTab() {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Coupon[]>("/api/coupons", fetcher);
  const [editing, setEditing] = useState<Coupon | null | undefined>(undefined);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing(null)}>
          <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Cupón")}
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={tr("Sin cupones")}
          description={tr("Crea un cupón para enviarlo en una campaña y que se aplique al cobrar.")}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900 font-mono">
                      {c.code} {!c.active && <Badge tone="gray">{tr("Inactivo")}</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.kind === "PERCENT" ? `${Math.round(c.value * 1000) / 10}%` : fmt.money(c.value)}
                      {c.minPurchase ? ` · ${tr("desde {amount}", { amount: fmt.money(c.minPurchase) })}` : ""}
                      {c.endsAt ? ` · ${tr("vence {date}", { date: fmt.date(c.endsAt) })}` : ""}
                      {` · ${tr("{uses} usos", { uses: c.uses })}${c.maxUses ? ` / ${c.maxUses}` : ""}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tr("Ventas con el cupón: {amount}", { amount: fmt.money(c.salesTotal ?? 0) })}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                    {tr("Editar")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && (
        <CouponForm
          coupon={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function CouponForm({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    kind: coupon?.kind ?? "PERCENT",
    value: coupon ? String(coupon.kind === "PERCENT" ? Math.round(coupon.value * 10000) / 100 : coupon.value) : "10",
    minPurchase: coupon?.minPurchase != null ? String(coupon.minPurchase) : "",
    endsAt: coupon?.endsAt?.slice(0, 10) ?? "",
    maxUses: coupon?.maxUses != null ? String(coupon.maxUses) : "",
    active: coupon?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const value = Number(form.value.replace(",", "."));
      await api(coupon ? `/api/coupons/${coupon.id}` : "/api/coupons", {
        method: coupon ? "PUT" : "POST",
        body: {
          code: form.code,
          kind: form.kind,
          value: form.kind === "PERCENT" ? value / 100 : value,
          minPurchase: form.minPurchase || null,
          startsAt: null,
          endsAt: form.endsAt ? `${form.endsAt}T23:59:59` : null,
          maxUses: form.maxUses || null,
          active: form.active,
        },
      });
      toast.success(tr("Cupón guardado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={coupon ? tr("Editar cupón") : tr("Nuevo cupón")}>
      <form onSubmit={save} className="space-y-3">
        <Input
          label={tr("Código")}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="VUELVE10"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={tr("Tipo de descuento")}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Coupon["kind"] })}
          >
            <option value="PERCENT">{tr("Porcentaje")}</option>
            <option value="AMOUNT">{tr("Monto fijo")}</option>
          </Select>
          <Input
            label={form.kind === "PERCENT" ? tr("Porcentaje (%)") : tr("Monto")}
            inputMode="decimal"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label={tr("Compra mínima")}
            inputMode="decimal"
            value={form.minPurchase}
            onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
            placeholder={tr("Opcional")}
          />
          <Input
            label={tr("Vence")}
            type="date"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
          <Input
            label={tr("Usos máximos")}
            inputMode="numeric"
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            placeholder={tr("Sin límite")}
          />
        </div>
        <Checkbox
          label={tr("Activo")}
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Guardar")}
        </Button>
      </form>
    </Modal>
  );
}
