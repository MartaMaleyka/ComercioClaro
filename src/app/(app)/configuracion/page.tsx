"use client";

import { useText } from "@/lib/client/i18n";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Building2, CreditCard, KeyRound, LogOut, Plus, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { usePaginated } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import { clearOfflineData } from "@/lib/client/offline-db";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { ThemeToggle } from "@/components/providers/ThemeToggle";
import { TranslationFeedbackButton } from "@/components/layout/TranslationFeedbackButton";
import { ServiceProvidersCard } from "@/components/settings/ServiceProvidersCard";
import { PayrollSettingsCard } from "@/components/settings/PayrollSettingsCard";
import { ScaleSettingsCard } from "@/components/settings/ScaleSettingsCard";
import { DeliveryZonesCard, type DeliveryZone } from "@/components/settings/DeliveryZonesCard";
import { COUNTRIES, countryConfig } from "@/lib/country";
import type { FeatureKey } from "@/lib/features";
import { LANGUAGES } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

type Tab = "perfil" | "negocio" | "usuarios" | "sucursales" | "bitacora";

export default function SettingsPage() {
  const tr = useText();
  const { role, business } = useSession();
  const isOwner = role === "OWNER";
  const [tab, setTab] = useState<Tab>(isOwner ? "negocio" : "perfil");
  const tabs: { value: Tab; label: string }[] = isOwner
    ? [
        { value: "negocio", label: tr("Negocio") },
        { value: "perfil", label: tr("Mi cuenta") },
        { value: "usuarios", label: tr("Usuarios") },
        ...(business.features.includes("branches") ? [{ value: "sucursales" as Tab, label: tr("Sucursales") }] : []),
        { value: "bitacora", label: tr("Bitácora") },
      ]
    : [{ value: "perfil", label: tr("Mi cuenta") }];

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title={tr("Configuración")}
        actions={
          isOwner && (
            <Link
              href="/configuracion/plan"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <CreditCard className="w-4 h-4" aria-hidden="true" /> {tr("Mi plan")}
            </Link>
          )
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "negocio" && isOwner && <BusinessSettings />}
      {tab === "perfil" && <ProfileSettings />}
      {tab === "usuarios" && isOwner && <MembersSettings />}
      {tab === "sucursales" && isOwner && <BranchesSettings />}
      {tab === "bitacora" && isOwner && <AuditLog />}
    </div>
  );
}

const CURRENCIES = ["USD", "MXN", "GTQ", "HNL", "NIO", "CRC", "PAB", "COP", "PEN", "CLP", "ARS", "BOB", "DOP", "EUR"];
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
  "America/Panama",
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
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  showBalboa: boolean;
  lowStockEmailAlerts: boolean;
  rfc: string | null;
  legalName: string | null;
  taxRegime: string | null;
  postalCode: string | null;
  ruc: string | null;
  dv: string | null;
  usesFreeInvoicer: boolean;
  einvoiceMode: "OFF" | "MANUAL" | "PAC";
  einvoiceProvider: string | null;
  autoInvoice: boolean;
  invoicePerSale: boolean;
  yappyMode: "STATIC" | "API";
  loyaltyEnabled: boolean;
  loyaltyPointsPerUnit: number;
  loyaltyPointValue: number;
  catalogEnabled: boolean;
  restaurantMode: boolean;
  catalogSlug: string | null;
  catalogWhatsapp: string | null;
  yappyDirectory: string | null;
  yappyQr: string | null;
  cardFeeRate: number;
  transferFeeRate: number;
  yappyFeeRate: number;
  region: "CAPITAL" | "INTERIOR" | null;
  offlineDays: number;
  seniorDiscountRate: number;
  deliveryZones: DeliveryZone[] | null;
}

/** Porcentajes de la Ley 6 de 1987 según el tipo de negocio. */
const SENIOR_PRESETS = [
  { value: 0, label: "No ofrezco descuento de jubilado" },
  { value: 0.25, label: "25% · restaurante o fonda (consumo individual)" },
  { value: 0.15, label: "15% · comida rápida" },
  { value: 0.2, label: "20% · farmacia (medicamentos)" },
  { value: 0.1, label: "10% · otros comercios" },
];

/** Valores recomendados según dónde está el negocio. */
const REGION_DEFAULTS = {
  CAPITAL: { offlineDays: 7 },
  INTERIOR: { offlineDays: 30 },
} as const;

function BusinessSettings() {
  const { data, mutate } = useSWR<BusinessData>("/api/business", fetcher);
  const { business } = useSession();
  if (!data) return <ListSkeleton rows={3} />;
  return (
    <div className="space-y-4">
      <BusinessForm initial={data} onSaved={() => mutate()} />
      {business.features.includes("catalog") && <DeliveryZonesCard initial={data.deliveryZones ?? []} />}
      {business.features.includes("services") && <ServiceProvidersCard />}
      {business.features.includes("payroll") && <PayrollSettingsCard />}
      <ScaleSettingsCard />
    </div>
  );
}

const MAX_QR_BYTES = 300 * 1024;

function BusinessForm({ initial, onSaved }: { initial: BusinessData; onSaved: () => Promise<unknown> | void }) {
  const tr = useText();
  const toast = useToast();
  const [form, setForm] = useState<BusinessData>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BusinessData>(k: K, v: BusinessData[K]) => setForm((f) => ({ ...f, [k]: v }));
  const features = useSession().business.features;
  const has = (feature: FeatureKey) => features.includes(feature);
  const country = countryConfig(form.country);
  const { data: pacProviders } = useSWR<{ id: string; name: string; configured: boolean }[]>(
    "/api/invoices/pac-providers",
    fetcher
  );
  // Las comisiones se editan en porcentaje y se guardan como fracción.
  const pct = (v: number) => String(Math.round(v * 10000) / 100);
  const [fees, setFees] = useState({
    card: pct(initial.cardFeeRate),
    transfer: pct(initial.transferFeeRate),
    yappy: pct(initial.yappyFeeRate),
  });

  function changeCountry(code: string) {
    const c = countryConfig(code);
    setForm((f) => ({
      ...f,
      country: c.code,
      currency: c.currency,
      locale: c.locale,
      timezone: c.timezone,
      showBalboa: c.showBalboa,
    }));
  }

  function loadQr(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_QR_BYTES) return toast.error(tr("La imagen del QR debe pesar menos de 300 KB"));
    const reader = new FileReader();
    reader.onload = () => set("yappyQr", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/business", {
        method: "PUT",
        body: {
          ...form,
          // Las zonas se guardan en su propia tarjeta.
          deliveryZones: undefined,
          cardFeeRate: (Number(fees.card) || 0) / 100,
          transferFeeRate: (Number(fees.transfer) || 0) / 100,
          yappyFeeRate: (Number(fees.yappy) || 0) / 100,
        },
      });
      toast.success(tr("Cambios guardados"));
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
          <h2 className="font-semibold text-slate-900">{tr("Datos del negocio")}</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input label={tr("Nombre")} value={form.name} onChange={(e) => set("name", e.target.value)} required />
          <Input
            label={tr("Descripción")}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label={tr("Teléfono")}
              type="tel"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
            />
            <Input
              label={tr("Dirección")}
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <Select
            label={tr("País")}
            value={form.country}
            onChange={(e) => changeCountry(e.target.value)}
            hint={tr(
              "Define impuestos, facturación y formatos. Al cambiarlo se ajustan moneda, formato y zona horaria."
            )}
          >
            {Object.values(COUNTRIES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="grid sm:grid-cols-3 gap-3">
            <Select label={tr("Formato")} value={form.locale} onChange={(e) => set("locale", e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
            <Select label={tr("Moneda")} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label={tr("Zona horaria")} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace("America/", "").replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
          {form.currency === "USD" && (
            <Checkbox
              label={tr("Mostrar montos como B/. (balboa)")}
              checked={form.showBalboa}
              onChange={(e) => set("showBalboa", e.target.checked)}
            />
          )}
          <Checkbox
            label={tr("Enviarme por correo las alertas diarias de bajo inventario y caducidad")}
            checked={form.lowStockEmailAlerts}
            onChange={(e) => set("lowStockEmailAlerts", e.target.checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">
            {country.code === "PA" ? tr("Capital o interior") : tr("Venta sin conexión")}
          </h2>
          {country.code === "PA" && (
            <p className="text-sm text-slate-500">
              {tr(
                "En la capital se paga con Yappy y se pide a domicilio; en el interior se paga en efectivo, se fía a la quincena y la señal se cae por días."
              )}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {country.code === "PA" && (
            <Select
              label={tr("¿Dónde está el negocio?")}
              value={form.region ?? ""}
              onChange={(e) => {
                const region = (e.target.value || null) as BusinessData["region"];
                setForm((f) => ({ ...f, region, ...(region ? REGION_DEFAULTS[region] : {}) }));
              }}
              hint={tr("Al elegirlo se ajustan los días de venta sin conexión.")}
            >
              <option value="">{tr("Sin definir")}</option>
              <option value="CAPITAL">{tr("Ciudad de Panamá, San Miguelito, Panamá Oeste o Colón")}</option>
              <option value="INTERIOR">{tr("Interior o comarca")}</option>
            </Select>
          )}
          <Input
            label={tr("Días que se aceptan ventas hechas sin conexión")}
            type="number"
            min={1}
            max={60}
            value={String(form.offlineDays)}
            onChange={(e) => set("offlineDays", Number(e.target.value) || 1)}
            hint={tr("Las ventas guardadas en el equipo conservan su fecha si se sincronizan dentro de este plazo.")}
          />
          {country.code === "PA" && (
            <Select
              label={tr("Descuento de jubilado (Ley 6)")}
              value={String(form.seniorDiscountRate)}
              onChange={(e) => set("seniorDiscountRate", Number(e.target.value))}
              hint={tr("Se aplica con el botón Jubilado en el punto de venta y queda en el reporte mensual.")}
            >
              {[
                ...SENIOR_PRESETS,
                ...(SENIOR_PRESETS.some((p) => p.value === form.seniorDiscountRate)
                  ? []
                  : [{ value: form.seniorDiscountRate, label: `${Math.round(form.seniorDiscountRate * 100)}%` }]),
              ].map((p) => (
                <option key={p.value} value={String(p.value)}>
                  {tr(p.label)}
                </option>
              ))}
            </Select>
          )}
        </CardContent>
      </Card>

      {has("restaurant") && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Modo restaurante")}</h2>
            <p className="text-sm text-slate-500">
              {tr("Para fondas y cafeterías: cuentas abiertas por mesa y pantalla de cocina.")}
            </p>
          </CardHeader>
          <CardContent>
            <Checkbox
              label={tr("Usar cuentas abiertas y pantalla de cocina")}
              checked={form.restaurantMode}
              onChange={(e) => set("restaurantMode", e.target.checked)}
            />
          </CardContent>
        </Card>
      )}

      {has("loyalty") && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Programa de puntos")}</h2>
            <p className="text-sm text-slate-500">
              {tr("Tus clientes registrados ganan puntos al comprar y los canjean como descuento.")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Checkbox
              label={tr("Activar puntos de lealtad")}
              checked={form.loyaltyEnabled}
              onChange={(e) => set("loyaltyEnabled", e.target.checked)}
            />
            {form.loyaltyEnabled && (
              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  label={tr("Puntos por cada 1.00 de compra")}
                  inputMode="decimal"
                  value={String(form.loyaltyPointsPerUnit)}
                  onChange={(e) => set("loyaltyPointsPerUnit", Number(e.target.value) || 0)}
                />
                <Input
                  label={tr("Valor de cada punto al canjear")}
                  inputMode="decimal"
                  value={String(form.loyaltyPointValue)}
                  onChange={(e) => set("loyaltyPointValue", Number(e.target.value) || 0)}
                  hint={tr("Ej.: con 1 punto por 1.00 y valor 0.01, cada compra devuelve 1%.")}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {has("catalog") && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Catálogo en línea")}</h2>
            <p className="text-sm text-slate-500">
              {tr(
                "Una página pública con tus productos y precios. Tus clientes arman su pedido y te lo envían por WhatsApp."
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Checkbox
              label={tr("Publicar catálogo")}
              checked={form.catalogEnabled}
              onChange={(e) => set("catalogEnabled", e.target.checked)}
            />
            {form.catalogEnabled && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    label={tr("Dirección del catálogo")}
                    value={form.catalogSlug ?? ""}
                    onChange={(e) => set("catalogSlug", e.target.value.toLowerCase())}
                    placeholder={"minisuper-el-dorado"}
                    hint={
                      form.catalogSlug ? `Tu enlace: /c/${form.catalogSlug}` : tr("Solo minúsculas, números y guiones")
                    }
                  />
                  <Input
                    label={tr("WhatsApp que recibe los pedidos")}
                    type="tel"
                    value={form.catalogWhatsapp ?? ""}
                    onChange={(e) => set("catalogWhatsapp", e.target.value)}
                    placeholder="6123-4567"
                  />
                </div>
                {initial.catalogEnabled && initial.catalogSlug && (
                  <a
                    href={`/c/${initial.catalogSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline text-brand-700 dark:text-brand-300"
                  >
                    {tr("Ver catálogo publicado")}
                  </a>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Comisiones por forma de pago")}</h2>
          <p className="text-sm text-slate-500">
            {tr("Se usan para mostrar cuánto te cuesta cobrar y tu ganancia después de comisiones.")}
          </p>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <Input
            label={tr("Tarjeta (%)")}
            inputMode="decimal"
            value={fees.card}
            onChange={(e) => setFees({ ...fees, card: e.target.value })}
          />
          <Input
            label={tr("Transferencia (%)")}
            inputMode="decimal"
            value={fees.transfer}
            onChange={(e) => setFees({ ...fees, transfer: e.target.value })}
          />
          {country.paymentMethods.includes("YAPPY") && (
            <Input
              label={tr("Yappy (%)")}
              inputMode="decimal"
              value={fees.yappy}
              onChange={(e) => setFees({ ...fees, yappy: e.target.value })}
              hint={tr("1% + ITBMS = 1.07%")}
            />
          )}
        </CardContent>
      </Card>

      {country.code === "PA" && (
        <>
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{tr("Datos fiscales (Panamá · DGI)")}</h2>
              <p className="text-sm text-slate-500">{tr("El RUC y el DV aparecen en el ticket.")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1fr_96px] gap-3">
                <Input
                  label={tr("RUC")}
                  value={form.ruc ?? ""}
                  onChange={(e) => set("ruc", e.target.value.toUpperCase())}
                  placeholder="8-123-4567"
                />
                <Input
                  label={tr("DV")}
                  inputMode="numeric"
                  maxLength={2}
                  value={form.dv ?? ""}
                  onChange={(e) => set("dv", e.target.value)}
                />
              </div>
              <Input
                label={tr("Razón social")}
                value={form.legalName ?? ""}
                onChange={(e) => set("legalName", e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{tr("Factura electrónica (DGI)")}</h2>
              <p className="text-sm text-slate-500">
                {tr("Obligatoria con PAC si superas B/.36,000 al año o 100 documentos al mes (Resolución 201-6299).")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                label={tr("¿Cómo facturas?")}
                value={form.einvoiceMode}
                onChange={(e) => set("einvoiceMode", e.target.value as BusinessData["einvoiceMode"])}
              >
                <option value="OFF">{tr("No emito factura electrónica todavía")}</option>
                <option value="MANUAL">{tr("Facturador gratuito o PAC externo (registro el CUFE a mano)")}</option>
                {(has("einvoice") || form.einvoiceMode === "PAC") && (
                  <option value="PAC">{tr("Automática desde ComercioClaro con un PAC")}</option>
                )}
              </Select>
              {form.einvoiceMode === "MANUAL" && (
                <>
                  <Checkbox
                    label={tr("Uso el facturador gratuito de la DGI (vigilar los límites)")}
                    checked={form.usesFreeInvoicer}
                    onChange={(e) => set("usesFreeInvoicer", e.target.checked)}
                  />
                  <Checkbox
                    label={tr(
                      "Emito una factura por cada venta (así el conteo mensual incluye todas las ventas y devoluciones)"
                    )}
                    checked={form.invoicePerSale}
                    onChange={(e) => set("invoicePerSale", e.target.checked)}
                  />
                </>
              )}
              {form.einvoiceMode === "PAC" && (
                <>
                  <Select
                    label={tr("PAC")}
                    value={form.einvoiceProvider ?? ""}
                    onChange={(e) => set("einvoiceProvider", e.target.value || null)}
                  >
                    <option value="">{tr("Selecciona")}</option>
                    {pacProviders?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.configured ? "" : tr(" — falta configurar credenciales")}
                      </option>
                    ))}
                  </Select>
                  {pacProviders?.find((p) => p.id === form.einvoiceProvider && !p.configured) && (
                    <p className="text-xs text-amber-700">
                      {tr(
                        "Agrega ALANUBE_API_URL y ALANUBE_TOKEN en las variables del servidor. Alanube entrega un sandbox gratuito al solicitarlo."
                      )}
                    </p>
                  )}
                  <Checkbox
                    label={tr("Emitir la factura de cada venta automáticamente")}
                    checked={form.autoInvoice}
                    onChange={(e) => set("autoInvoice", e.target.checked)}
                  />
                  <p className="text-xs text-slate-500">
                    {tr(
                      "Si el PAC o la DGI no responden, la factura queda en contingencia y se reintenta sola. El ticket imprime el CUFE y su código QR."
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-900">{tr("Yappy")}</h2>
              <p className="text-sm text-slate-500">{tr("Se muestra en el punto de venta al cobrar con Yappy.")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                label={tr("Modo de cobro")}
                value={form.yappyMode}
                onChange={(e) => set("yappyMode", e.target.value as BusinessData["yappyMode"])}
                hint={
                  form.yappyMode === "API"
                    ? tr(
                        "El cajero escribe el celular del cliente, el cobro le llega a su app y la venta se registra sola al confirmarse. Requiere Yappy Comercial con API (credenciales en el servidor)."
                      )
                    : tr("El cliente escanea tu QR y el cajero confirma el pago en la app.")
                }
              >
                <option value="STATIC">{tr("QR fijo del comercio (confirmación manual)")}</option>
                {(has("yappyApi") || form.yappyMode === "API") && (
                  <option value="API">{tr("Cobro automático por celular (API de Yappy Comercial)")}</option>
                )}
              </Select>
              <Input
                label={tr("Nombre o número en el directorio Yappy")}
                value={form.yappyDirectory ?? ""}
                onChange={(e) => set("yappyDirectory", e.target.value)}
                placeholder={tr("@minisuperlaesperanza o 6123-4567")}
              />
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-slate-700">{tr("QR de cobro de Yappy Comercial")}</p>
                {form.yappyQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.yappyQr}
                    alt={tr("QR de Yappy")}
                    className="w-40 h-40 object-contain rounded-xl border border-slate-200 bg-white"
                  />
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={tr("Subir imagen del QR de Yappy")}
                    onChange={(e) => loadQr(e.target.files?.[0])}
                    className="text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
                  />
                  {form.yappyQr && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("yappyQr", null)}>
                      {tr("Quitar")}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {country.code === "MX" && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">{tr("Datos fiscales (México · CFDI 4.0)")}</h2>
            <p className="text-sm text-slate-500">
              {tr("Necesarios para facturar. Cópialos de tu Constancia de Situación Fiscal.")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label={tr("RFC")}
                value={form.rfc ?? ""}
                onChange={(e) => set("rfc", e.target.value.toUpperCase())}
              />
              <Input
                label={tr("C.P. (lugar de expedición)")}
                inputMode="numeric"
                value={form.postalCode ?? ""}
                onChange={(e) => set("postalCode", e.target.value)}
              />
            </div>
            <Input
              label={tr("Razón social / nombre")}
              value={form.legalName ?? ""}
              onChange={(e) => set("legalName", e.target.value)}
            />
            <Select
              label={tr("Régimen fiscal")}
              value={form.taxRegime ?? ""}
              onChange={(e) => set("taxRegime", e.target.value)}
            >
              <option value="">{tr("Selecciona")}</option>
              <option value="626">{tr("626 · Régimen Simplificado de Confianza (RESICO)")}</option>
              <option value="612">{tr("612 · Personas Físicas con Actividades Empresariales")}</option>
              <option value="625">{tr("625 · Plataformas Tecnológicas")}</option>
              <option value="601">{tr("601 · General de Ley Personas Morales")}</option>
              <option value="621">{tr("621 · Incorporación Fiscal")}</option>
            </Select>
          </CardContent>
        </Card>
      )}

      <Button type="submit" loading={saving}>
        {tr("Guardar cambios")}
      </Button>
    </form>
  );
}

function ProfileSettings() {
  const tr = useText();
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
      toast.success(tr("Contraseña actualizada. Se cerraron tus otras sesiones."));
      setCurrent("");
      setNext("");
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function logoutAll() {
    if (
      !(await confirm({
        title: tr("Cerrar sesión en todos los dispositivos"),
        message: tr("Tendrás que volver a iniciar sesión en cada dispositivo."),
        confirmLabel: tr("Cerrar todas"),
      }))
    )
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
          <p className="text-sm font-medium text-slate-700">{tr("Tema")}</p>
          <ThemeToggle />
          <Select
            label={tr("Idioma / 语言 / Language")}
            value={user.language}
            onChange={async (e) => {
              try {
                await api("/api/auth/me", { method: "PUT", body: { language: e.target.value } });
                window.location.reload();
              } catch (err) {
                toast.error(err);
              }
            }}
            hint={tr("Si ves un texto mal traducido, usa “Reportar traducción”.")}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
          <TranslationFeedbackButton className="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-300 underline" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> {tr("Cambiar contraseña")}
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <Input
              label={tr("Contraseña actual")}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <Input
              label={tr("Nueva contraseña")}
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              hint={tr("Mínimo 8 caracteres")}
            />
            <Button type="submit" loading={saving}>
              {tr("Actualizar contraseña")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Button variant="secondary" onClick={logoutAll}>
        <LogOut className="w-4 h-4" /> {tr("Cerrar sesión en todos los dispositivos")}
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
  const tr = useText();
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
    if (
      !(await confirm({
        title: `Quitar a ${m.user.name}`,
        message: tr("Perderá el acceso a este negocio de inmediato."),
        danger: true,
        confirmLabel: tr("Quitar"),
      }))
    )
      return;
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
          {tr("Los cajeros pueden vender, manejar caja y clientes, pero no ven costos, reportes ni configuración.")}
        </p>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="w-4 h-4" /> {tr("Agregar")}
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
                <Badge tone={m.role === "OWNER" ? "green" : "gray"}>
                  {m.role === "OWNER" ? tr("Dueño") : tr("Cajero")}
                </Badge>
                {m.user.id !== user.id && (
                  <button
                    aria-label={`Quitar a ${m.user.name}`}
                    onClick={() => remove(m)}
                    className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={tr("Agregar usuario")}>
        <form onSubmit={add} className="space-y-3">
          <Input
            label={tr("Nombre")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={tr("Correo")}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Select label={tr("Rol")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CASHIER">{tr("Cajero")}</option>
            <option value="OWNER">{tr("Dueño (acceso total)")}</option>
          </Select>
          <Button type="submit" className="w-full" loading={saving}>
            {tr("Agregar")}
          </Button>
        </form>
      </Modal>

      <Modal open={invite !== null} onClose={() => setInvite(null)} title={tr("Usuario agregado")}>
        {invite && (
          <div className="space-y-3 text-sm">
            {invite.tempPassword ? (
              <>
                <p>
                  {tr("Comparte estos datos con la persona. Deberá cambiar la contraseña al entrar.")}
                  {invite.emailed && " También se los enviamos por correo."}
                </p>
                <p className="rounded-xl bg-slate-100 p-3 font-mono">
                  {invite.email}
                  <br />
                  {invite.tempPassword}
                </p>
                <p className="text-xs text-slate-500">{tr("Esta contraseña no se volverá a mostrar.")}</p>
              </>
            ) : (
              <p>{tr("La persona ya tenía cuenta; ahora puede elegir este negocio al iniciar sesión.")}</p>
            )}
            <Button className="w-full" onClick={() => setInvite(null)}>
              {tr("Listo")}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BranchesSettings() {
  const tr = useText();
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
      toast.success(tr("Sucursal creada. Cámbiate a ella desde el selector bajo el logo."));
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
        {tr("Cada sucursal tiene su propio inventario, caja y ventas. En Reportes puedes ver el consolidado de todas.")}
      </p>
      {businesses.map((b) => (
        <Card key={b.id}>
          <CardContent className="flex justify-between items-center py-3">
            <span className="flex items-center gap-2 text-slate-900">
              <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" /> {b.name}
            </span>
            {b.id === business.id && <Badge tone="green">{tr("Actual")}</Badge>}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <Input
              label={tr("Nueva sucursal")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={tr("Ej. Sucursal Centro")}
            />
            <Checkbox
              label={tr("Copiar el catálogo de productos (sin existencias)")}
              checked={copyCatalog}
              onChange={(e) => setCopyCatalog(e.target.checked)}
            />
            <Button type="submit" loading={saving}>
              <Plus className="w-4 h-4" /> {tr("Crear sucursal")}
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
  const tr = useText();
  const fmt = useFormat();
  const list = usePaginated<AuditEntry>("/api/business/audit", { limit: 50 });
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {tr("Registro de quién hizo cada operación importante.")}
      </p>
      {list.isLoading ? (
        <ListSkeleton />
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-100 py-0">
            {list.items.map((e) => (
              <div key={e.id} className="py-2.5 text-sm flex justify-between gap-3">
                <span>
                  <span className="font-medium text-slate-900">{e.userName ?? tr("Sistema")}</span>{" "}
                  <span className="text-slate-600">{tr(ACTION_LABELS[e.action] ?? e.action)}</span>
                  {e.details && "folio" in e.details && (
                    <span className="text-slate-500"> #{String(e.details.folio)}</span>
                  )}
                  {e.details && "reason" in e.details && e.details.reason ? (
                    <span className="text-slate-500"> · {String(e.details.reason)}</span>
                  ) : null}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{fmt.dateTime(e.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
      <TranslationReports />
    </div>
  );
}

interface TranslationReport {
  id: string;
  language: string;
  screen: string;
  original: string;
  suggestion: string;
  createdAt: string;
}

/** Reportes de traducción que envió el equipo (sirven para validar el chino con dueños de minisúper). */
function TranslationReports() {
  const tr = useText();
  const fmt = useFormat();
  const { data } = useSWR<TranslationReport[]>("/api/translations/feedback", fetcher);
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">{tr("Reportes de traducción")}</h2>
      </CardHeader>
      <CardContent className="divide-y divide-slate-100 py-0">
        {data.map((r) => (
          <div key={r.id} className="py-2.5 text-sm">
            <p className="text-slate-900">
              <Badge tone="gray">{r.language}</Badge> {r.original} → <span className="font-medium">{r.suggestion}</span>
            </p>
            <p className="text-xs text-slate-500">
              {r.screen} · {fmt.dateTime(r.createdAt)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
