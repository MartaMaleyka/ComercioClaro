"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bike, Inbox, MessageCircle, ShoppingCart, Store } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { whatsappLink } from "@/lib/client/receipt";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState, ListSkeleton, PageHeader } from "@/components/ui/Misc";

type Status = "NEW" | "ACCEPTED" | "READY" | "DELIVERED" | "CANCELLED";

export interface OnlineOrder {
  id: string;
  number: number;
  status: Status;
  customerName: string;
  phone: string | null;
  notes: string | null;
  fulfillment: "PICKUP" | "DELIVERY";
  address: string | null;
  items: { productId: string; name: string; unit: string; quantity: number; price: number }[];
  total: number;
  createdAt: string;
  sale: { id: string; folio: number; total: number } | null;
}

const STATUS: Record<Status, { label: string; tone: "red" | "amber" | "green" | "gray" | "blue" }> = {
  NEW: { label: "Nuevo", tone: "red" },
  ACCEPTED: { label: "Aceptado", tone: "amber" },
  READY: { label: "Listo para entregar", tone: "blue" },
  DELIVERED: { label: "Entregado", tone: "green" },
  CANCELLED: { label: "Cancelado", tone: "gray" },
};

/** Bandeja de pedidos del catálogo en línea. */
export default function OrdersPage() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = useSession();
  const [scope, setScope] = useState<"active" | "delivered" | "cancelled">("active");
  const { data, error, mutate } = useSWR<OnlineOrder[]>(`/api/orders?scope=${scope}`, fetcher, {
    refreshInterval: scope === "active" ? 20_000 : 0,
  });

  async function setStatus(order: OnlineOrder, status: Status) {
    if (status === "CANCELLED") {
      const ok = await confirm({
        title: tr("Cancelar pedido #{n}", { n: order.number }),
        message: tr("Avísale al cliente por WhatsApp si ya no podrás atender su pedido."),
        danger: true,
        confirmLabel: tr("Cancelar pedido"),
      });
      if (!ok) return;
    }
    try {
      await api(`/api/orders/${order.id}`, { method: "PATCH", body: { status } });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={tr("Pedidos")} description={tr("Pedidos que tus clientes hacen desde el catálogo en línea")} />
      {!business.catalogEnabled && (
        <p className="text-sm text-amber-700">{tr("El catálogo en línea está apagado. Actívalo en Configuración.")}</p>
      )}
      <Tabs
        label={tr("Estado de los pedidos")}
        tabs={[
          { value: "active", label: tr("Por atender") },
          { value: "delivered", label: tr("Entregados") },
          { value: "cancelled", label: tr("Cancelados") },
        ]}
        value={scope}
        onChange={setScope}
      />
      {error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tr("Sin pedidos")}
          description={tr("Comparte el enlace de tu catálogo por WhatsApp o redes para recibir pedidos aquí.")}
        />
      ) : (
        <ul className="grid md:grid-cols-2 gap-3">
          {data.map((o) => (
            <li key={o.id}>
              <Card className={o.status === "NEW" ? "border-red-200" : undefined}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">
                        {tr("Pedido #{n}", { n: o.number })} · {o.customerName}
                      </h2>
                      <p className="text-xs text-slate-500">{fmt.dateTime(o.createdAt)}</p>
                    </div>
                    <Badge tone={STATUS[o.status].tone}>{tr(STATUS[o.status].label)}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 flex items-center gap-2">
                    {o.fulfillment === "DELIVERY" ? (
                      <>
                        <Bike className="w-4 h-4 shrink-0" aria-hidden="true" /> {tr("A domicilio")}
                        {o.address ? `: ${o.address}` : ""}
                      </>
                    ) : (
                      <>
                        <Store className="w-4 h-4 shrink-0" aria-hidden="true" /> {tr("Recoge en tienda")}
                      </>
                    )}
                  </p>
                  <ul className="text-sm divide-y divide-slate-100">
                    {o.items.map((i) => (
                      <li key={i.productId} className="py-1 flex justify-between gap-2">
                        <span>
                          {fmt.qty(i.quantity, i.unit)} · {i.name}
                        </span>
                        <span className="tabular-nums">{fmt.money(i.quantity * i.price)}</span>
                      </li>
                    ))}
                  </ul>
                  {o.notes && (
                    <p className="text-sm text-slate-600">
                      {tr("Nota:")} {o.notes}
                    </p>
                  )}
                  <p className="flex justify-between font-semibold">
                    <span>{tr("Total")}</span>
                    <span className="tabular-nums">{fmt.money(o.total)}</span>
                  </p>
                  {o.sale && (
                    <Link href={`/ventas/${o.sale.id}`} className="text-sm underline text-slate-700">
                      {tr("Cobrado en la venta #{folio}", { folio: o.sale.folio })}
                    </Link>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {o.status === "NEW" && (
                      <Button size="sm" onClick={() => setStatus(o, "ACCEPTED")}>
                        {tr("Aceptar")}
                      </Button>
                    )}
                    {(o.status === "NEW" || o.status === "ACCEPTED") && (
                      <Button size="sm" variant="secondary" onClick={() => setStatus(o, "READY")}>
                        {tr("Marcar listo")}
                      </Button>
                    )}
                    {["NEW", "ACCEPTED", "READY"].includes(o.status) && (
                      <>
                        <Link
                          href={`/ventas?pedido=${o.id}`}
                          className={buttonStyles("primary", "sm")}
                        >
                          <ShoppingCart className="w-4 h-4" aria-hidden="true" /> {tr("Cobrar en el punto de venta")}
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(o, "CANCELLED")}>
                          {tr("Cancelar")}
                        </Button>
                      </>
                    )}
                    {o.phone && (
                      <a
                        href={whatsappLink(
                          tr("Hola {name}, te escribe {business} sobre tu pedido #{n}.", {
                            name: o.customerName,
                            business: business.name,
                            n: o.number,
                          }),
                          o.phone,
                          business.locale
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonStyles("secondary", "sm")}
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden="true" /> {tr("WhatsApp")}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
