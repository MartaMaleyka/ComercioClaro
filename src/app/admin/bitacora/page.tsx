"use client";

import Link from "next/link";
import useSWRInfinite from "swr/infinite";
import { fetcher, withQuery } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { adminFmt } from "@/lib/client/admin-format";
import { ACTION_LABELS } from "@/components/admin/labels";
import { Card, CardContent } from "@/components/ui/Card";
import { ErrorState, ListSkeleton, LoadMore, PageHeader } from "@/components/ui/Misc";

interface Entry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  userId: string;
  user: { name: string; email: string } | null;
}

interface Page {
  items: Entry[];
  nextCursor: string | null;
}

export default function AdminAuditPage() {
  const tr = useText();
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<Page>(
    (index, previous: Page | null) =>
      index === 0
        ? "/api/admin/audit"
        : previous?.nextCursor
          ? withQuery("/api/admin/audit", { cursor: previous.nextCursor })
          : null,
    fetcher
  );
  const items = data?.flatMap((p) => p.items) ?? [];
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);

  return (
    <div className="space-y-5">
      <PageHeader title={tr("Bitácora")} description={tr("Lo que hicieron los administradores de la plataforma")} />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton rows={6} />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("Sin cambios registrados.")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-100 py-0">
            {items.map((e) => (
              <div key={e.id} className="py-3 flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-900">
                    {tr(ACTION_LABELS[e.action] ?? e.action)}
                    {e.entity === "Business" && e.entityId && (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/negocios/${e.entityId}`}
                          className="text-brand-700 dark:text-brand-300 underline"
                        >
                          {String(e.details?.name ?? tr("Ver negocio"))}
                        </Link>
                      </>
                    )}
                    {e.entity !== "Business" && e.details?.email != null && ` · ${String(e.details.email)}`}
                    {e.entity === "Plan" && e.details?.code != null && ` · ${String(e.details.code)}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.user ? `${e.user.name} · ${e.user.email}` : e.userId === "billing" ? tr("Cobro automático") : ""}
                  </p>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{adminFmt.dateTime(e.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <LoadMore hasMore={hasMore} loading={isValidating} onClick={() => setSize(size + 1)} />
    </div>
  );
}
