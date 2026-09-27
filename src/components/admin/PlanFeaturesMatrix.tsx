"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Sparkles, Store } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { FEATURE_GROUPS, FEATURES, NEW_FEATURE_KEYS, type FeatureKey } from "@/lib/features";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton, ScrollArea } from "@/components/ui/Misc";
import { SegmentedControl, Switch } from "@/components/ui/Switch";

type Mode = "plan" | "on" | "off";

interface Matrix {
  totalBusinesses: number;
  plans: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    isDefault: boolean;
    businesses: number;
    features: FeatureKey[];
  }[];
  usage: Record<FeatureKey, { active: number; forcedOn: number; forcedOff: number }>;
}

type Filter = "all" | "new" | "partial";

/**
 * Funciones por plan (pestaña de Planes y precios): interruptores que se guardan al momento,
 * agrupados y con buscador, y el ajuste por negocio desde "En uso".
 */
export function PlanFeaturesMatrix({ onChanged }: { onChanged?: () => void }) {
  const tr = useText();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, mutate } = useSWR<Matrix>("/api/admin/features", fetcher);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeatureKey | null>(null);

  const isNew = (key: FeatureKey) => NEW_FEATURE_KEYS.includes(key);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    return FEATURES.filter((f) => {
      if (filter === "new" && !NEW_FEATURE_KEYS.includes(f.key)) return false;
      if (filter === "partial" && data && data.plans.every((p) => p.features.includes(f.key))) return false;
      if (!q) return true;
      return `${tr(f.label)} ${tr(f.description)} ${f.label}`.toLocaleLowerCase("es").includes(q);
    });
  }, [query, filter, data, tr]);

  async function toggle(planId: string, feature: FeatureKey, enabled: boolean) {
    if (!data) return;
    const plan = data.plans.find((p) => p.id === planId)!;
    const label = tr(FEATURES.find((f) => f.key === feature)!.label);
    if (!enabled && plan.businesses > 0) {
      const ok = await confirm({
        title: tr("¿Quitar {feature} del plan {plan}?", { feature: label, plan: plan.name }),
        message: tr(
          "Se apagará al momento en {n} negocio(s) de este plan, salvo los que la tengan activada a mano. No se borra ningún dato: al volver a encenderla, todo sigue ahí.",
          { n: plan.businesses }
        ),
        confirmLabel: tr("Quitar del plan"),
        danger: true,
      });
      if (!ok) return;
    }
    const key = `${planId}:${feature}`;
    setSaving(key);
    // Se ve el cambio de inmediato; si el servidor falla, se vuelve a leer.
    mutate(
      {
        ...data,
        plans: data.plans.map((p) =>
          p.id === planId
            ? { ...p, features: enabled ? [...p.features, feature] : p.features.filter((f) => f !== feature) }
            : p
        ),
      },
      { revalidate: false }
    );
    try {
      await api(`/api/admin/plans/${planId}/features`, { method: "PUT", body: { feature, enabled } });
      toast.success(
        enabled
          ? tr("{feature} incluida en el plan {plan}", { feature: label, plan: plan.name })
          : tr("{feature} quitada del plan {plan}", { feature: label, plan: plan.name })
      );
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(null);
      mutate();
      onChanged?.();
    }
  }

  const newPending =
    data && NEW_FEATURE_KEYS.filter((k) => data.plans.filter((p) => p.active).some((p) => !p.features.includes(k)));

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        {tr(
          "Enciende o apaga cada función por plan. El cambio se aplica al momento a todos los negocios del plan; para un negocio en particular, usa En uso o su ficha."
        )}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryTile label={tr("Funciones")} value={String(FEATURES.length)} />
            <SummaryTile label={tr("Nuevas")} value={String(NEW_FEATURE_KEYS.length)} accent />
            <SummaryTile label={tr("Negocios en la plataforma")} value={String(data.totalBusinesses)} />
          </div>

          {data.plans.length === 0 && (
            <p className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">
              {tr(
                "Aún no hay planes: todos los negocios tienen todas las funciones. Crea un plan en la pestaña Planes."
              )}
            </p>
          )}

          {newPending && newPending.length > 0 && filter !== "new" && (
            <div
              role="note"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-purple-50 px-4 py-3"
            >
              <p className="flex items-center gap-2 text-sm text-purple-700">
                <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                {tr("{n} función(es) nueva(s) no están en todos los planes activos. Revisa dónde deben estar.", {
                  n: newPending.length,
                })}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setFilter("new")}>
                {tr("Ver solo las nuevas")}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 bottom-3 w-4 h-4 text-slate-400" aria-hidden="true" />
              <Input
                label={tr("Buscar función")}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Recetas, planilla, Yappy…")}
                className="pl-9"
              />
            </div>
            <SegmentedControl<Filter>
              label={tr("Mostrar")}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: tr("Todas") },
                { value: "new", label: tr("Nuevas") },
                { value: "partial", label: tr("No están en todos los planes") },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{tr("Ninguna función coincide con la búsqueda.")}</p>
          ) : (
            FEATURE_GROUPS.map((group) => {
              const rows = visible.filter((f) => f.group === group.key);
              if (rows.length === 0) return null;
              return (
                <section key={group.key} aria-labelledby={`grupo-${group.key}`} className="space-y-2">
                  <h2 id={`grupo-${group.key}`} className="text-sm font-semibold text-slate-700">
                    {tr(group.label)} <span className="font-normal text-slate-500">· {rows.length}</span>
                  </h2>
                  <Card>
                    <CardContent className="p-0">
                      <ScrollArea label={tr("Funciones de {group} por plan", { group: tr(group.label) })}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100">
                              <th scope="col" className="py-2.5 px-4 font-medium min-w-64">
                                {tr("Función")}
                              </th>
                              {data.plans.map((p) => (
                                <th
                                  key={p.id}
                                  scope="col"
                                  className="py-2.5 px-3 font-medium text-center whitespace-nowrap"
                                >
                                  <span className="block text-slate-700">{p.name}</span>
                                  <span className="block text-xs font-normal">
                                    {!p.active ? tr("inactivo") : tr("{n} negocio(s)", { n: p.businesses })}
                                  </span>
                                </th>
                              ))}
                              <th scope="col" className="py-2.5 px-4 font-medium text-right whitespace-nowrap">
                                {tr("En uso")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((f) => {
                              const usage = data.usage[f.key];
                              const manual = usage.forcedOn + usage.forcedOff;
                              return (
                                <tr key={f.key} className="border-b border-slate-100 last:border-0 align-top">
                                  <th scope="row" className="py-3 px-4 text-left font-normal">
                                    <span className="flex items-center gap-2 font-medium text-slate-900">
                                      {tr(f.label)}
                                      {isNew(f.key) && <Badge tone="purple">{tr("Nueva")}</Badge>}
                                    </span>
                                    <span className="block text-xs text-slate-500 mt-0.5">{tr(f.description)}</span>
                                  </th>
                                  {data.plans.map((p) => (
                                    <td key={p.id} className="py-3 px-3 text-center">
                                      <Switch
                                        checked={p.features.includes(f.key)}
                                        onChange={(on) => toggle(p.id, f.key, on)}
                                        busy={saving === `${p.id}:${f.key}`}
                                        label={tr("{feature} en el plan {plan}", {
                                          feature: tr(f.label),
                                          plan: p.name,
                                        })}
                                      />
                                    </td>
                                  ))}
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setDetail(f.key)}
                                      className="text-brand-700 dark:text-brand-300 font-medium hover:underline"
                                      aria-label={tr("Negocios con {feature}: {n} de {total}", {
                                        feature: tr(f.label),
                                        n: usage.active,
                                        total: data.totalBusinesses,
                                      })}
                                    >
                                      {tr("{n} de {total}", { n: usage.active, total: data.totalBusinesses })}
                                    </button>
                                    {manual > 0 && (
                                      <span className="block text-xs text-slate-500">
                                        {tr("{n} ajuste(s) a mano", { n: manual })}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </section>
              );
            })
          )}
        </>
      )}

      <FeatureBusinessesModal feature={detail} onClose={() => setDetail(null)} onChanged={() => mutate()} />
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={accent ? "text-2xl font-bold text-purple-700" : "text-2xl font-bold text-slate-900"}>{value}</p>
    </div>
  );
}

interface BusinessRow {
  id: string;
  name: string;
  status: string;
  planName: string | null;
  inPlan: boolean;
  mode: Mode;
  active: boolean;
}

/** Negocios con una función y ajuste por negocio (se guarda al momento). */
function FeatureBusinessesModal({
  feature,
  onClose,
  onChanged,
}: {
  feature: FeatureKey | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const { data, mutate } = useSWR<BusinessRow[]>(feature ? `/api/admin/features/${feature}` : null, fetcher);
  const [query, setQuery] = useState("");
  const info = FEATURES.find((f) => f.key === feature);
  const rows = (data ?? []).filter((b) =>
    b.name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))
  );

  async function change(row: BusinessRow, mode: Mode) {
    if (!feature || !data) return;
    const active = mode === "plan" ? row.inPlan : mode === "on";
    mutate(
      data.map((b) => (b.id === row.id ? { ...b, mode, active } : b)),
      { revalidate: false }
    );
    try {
      await api(`/api/admin/businesses/${row.id}/features`, { method: "PUT", body: { feature, mode } });
      toast.success(
        active
          ? tr("{feature} activa en {name}", { feature: tr(info!.label), name: row.name })
          : tr("{feature} apagada en {name}", { feature: tr(info!.label), name: row.name })
      );
      onChanged();
    } catch (err) {
      toast.error(err);
      mutate();
    }
  }

  return (
    <Modal open={feature !== null} onClose={onClose} title={info ? tr(info.label) : ""} size="lg">
      {info && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{tr(info.description)}</p>
          <p className="text-xs text-slate-500">
            {tr(
              "Según plan: la tiene si su plan la incluye. Sí o No: ajuste solo para ese negocio, sin importar el plan."
            )}
          </p>
          <Input label={tr("Buscar negocio")} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          {!data ? (
            <ListSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">{tr("Ningún negocio coincide.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((b) => (
                <li key={b.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Link
                      href={`/admin/negocios/${b.id}`}
                      className="font-medium text-slate-900 hover:underline inline-flex items-center gap-1.5"
                    >
                      <Store className="w-4 h-4 text-slate-400" aria-hidden="true" /> {b.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {b.planName ?? tr("Sin plan")}
                      {" · "}
                      {b.active ? tr("Activa") : tr("Apagada")}
                      {b.mode !== "plan" && ` · ${tr("ajuste a mano")}`}
                    </span>
                  </span>
                  <SegmentedControl<Mode>
                    label={tr("{feature} en {name}", { feature: tr(info.label), name: b.name })}
                    value={b.mode}
                    onChange={(mode) => change(b, mode)}
                    options={[
                      {
                        value: "plan",
                        label: b.inPlan ? tr("Plan (sí)") : tr("Plan (no)"),
                        title: b.inPlan ? tr("Según el plan (sí)") : tr("Según el plan (no)"),
                      },
                      { value: "on", label: tr("Sí"), title: tr("Activada solo para este negocio") },
                      { value: "off", label: tr("No"), title: tr("Desactivada solo para este negocio") },
                    ]}
                    tone={(v) =>
                      v !== b.mode
                        ? "text-slate-600"
                        : v === "on"
                          ? "bg-brand-600 text-white shadow-sm"
                          : v === "off"
                            ? "bg-slate-700 text-white shadow-sm"
                            : "bg-surface text-slate-900 shadow-sm"
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
