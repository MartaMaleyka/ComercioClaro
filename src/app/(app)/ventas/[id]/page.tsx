"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, FileText, Printer, Share2, Undo2, XCircle } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { whatsappLink } from "@/lib/client/receipt";
import { countryConfig } from "@/lib/country";
import type { Customer, PaymentMethod, Sale } from "@/lib/client/types";
import { PAYMENT_METHOD_LABELS, UNIT_LABELS, isFractionalUnit } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton } from "@/components/ui/Misc";

const CFDI_USES = [
  { value: "G03", label: "G03 · Gastos en general" },
  { value: "G01", label: "G01 · Adquisición de mercancías" },
  { value: "S01", label: "S01 · Sin efectos fiscales" },
  { value: "CP01", label: "CP01 · Pagos" },
];

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { business, role } = useSession();
  const isOwner = role === "OWNER";
  const country = countryConfig(business.country);
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: sale, error, mutate } = useSWR<Sale>(`/api/sales/${id}`, fetcher);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("CASH");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceCustomer, setInvoiceCustomer] = useState("");
  const [cfdiUse, setCfdiUse] = useState("G03");
  const [busy, setBusy] = useState(false);
  const { data: customers } = useSWR<Customer[]>(invoiceOpen ? "/api/customers" : null, fetcher);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!sale) return <ListSkeleton rows={3} />;

  const active = sale.status === "ACTIVE";

  async function cancel() {
    const reason = await confirm({
      title: `Cancelar venta #${sale!.folio}`,
      message: "El inventario no devuelto regresará al almacén y, si fue fiado, se ajustará el saldo del cliente.",
      inputLabel: "Motivo de la cancelación",
      confirmLabel: "Cancelar venta",
      danger: true,
    });
    if (typeof reason !== "string") return;
    try {
      await api(`/api/sales/${id}/cancel`, { body: { reason } });
      toast.success("Venta cancelada");
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  function openReturn() {
    setReturnQty({});
    setReturnReason("");
    setRefundMethod(sale!.paymentMethod === "CREDIT" ? "CREDIT" : "CASH");
    setReturnOpen(true);
  }

  async function submitReturn() {
    const items = Object.entries(returnQty)
      .map(([saleItemId, q]) => ({ saleItemId, quantity: Number(q) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) return toast.error("Indica qué cantidad se devuelve");
    setBusy(true);
    try {
      await api(`/api/sales/${id}/return`, { body: { items, reason: returnReason || null, refundMethod } });
      toast.success("Devolución registrada");
      setReturnOpen(false);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function registerCufe() {
    const cufe = await confirm({
      title: `Registrar factura de la venta #${sale!.folio}`,
      message: "Pega el CUFE que te dio el facturador de la DGI o tu PAC al emitir la factura.",
      inputLabel: "CUFE",
      confirmLabel: "Registrar",
    });
    if (typeof cufe !== "string") return;
    try {
      await api("/api/invoices/external", { body: { saleId: id, cufe } });
      toast.success("Factura registrada");
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function submitInvoice() {
    setBusy(true);
    try {
      await api("/api/invoices", { body: { saleId: id, customerId: invoiceCustomer, cfdiUse } });
      toast.success("Factura timbrada");
      setInvoiceOpen(false);
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const profit =
    sale.costTotal !== undefined ? sale.total - sale.costTotal - sale.returns.reduce((a, r) => a + r.total, 0) : null;

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        href="/ventas/historial"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" /> Ventas
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Venta #{sale.folio}</h1>
          <p className="text-sm text-slate-500">
            {fmt.dateTime(sale.createdAt)} · {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
            {sale.paymentReference && ` (ref. ${sale.paymentReference})`}
            {sale.customer && ` · ${sale.customer.name}`}
          </p>
          {sale.dueDate && sale.status === "ACTIVE" && (
            <p className="text-sm text-slate-500">Vence: {fmt.date(sale.dueDate)}</p>
          )}
          <div className="flex gap-1 mt-1">
            {!active && <Badge tone="red">Cancelada</Badge>}
            {sale.invoice?.status === "STAMPED" && (
              <Badge tone="blue">Facturada{sale.invoice.uuid ? ` · ${sale.invoice.uuid.slice(0, 12)}…` : ""}</Badge>
            )}
          </div>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${active ? "text-slate-900" : "line-through text-slate-400"}`}>
          {fmt.money(sale.total)}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => window.open(`/ventas/${id}/ticket`, "_blank")}>
          <Printer className="w-4 h-4" /> Ticket
        </Button>
        {sale.receiptText && (
          <a
            href={whatsappLink(sale.receiptText, sale.customer?.phone, business.locale)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium"
          >
            <Share2 className="w-4 h-4" /> WhatsApp
          </a>
        )}
        {isOwner && active && (
          <>
            <Button variant="secondary" size="sm" onClick={openReturn}>
              <Undo2 className="w-4 h-4" /> Devolución
            </Button>
            {!sale.invoice && country.invoicing === "cfdi" && (
              <Button variant="secondary" size="sm" onClick={() => setInvoiceOpen(true)}>
                <FileText className="w-4 h-4" /> Facturar
              </Button>
            )}
            {!sale.invoice && country.invoicing === "dgi" && (
              <Button variant="secondary" size="sm" onClick={registerCufe}>
                <FileText className="w-4 h-4" /> Registrar CUFE
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={cancel}>
              <XCircle className="w-4 h-4" /> Cancelar
            </Button>
          </>
        )}
      </div>

      {!active && sale.cancelReason && (
        <p className="text-sm rounded-xl bg-red-50 text-red-700 px-4 py-2">
          Motivo de cancelación: {sale.cancelReason}
        </p>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Productos</h2>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 py-0">
          {sale.items.map((item) => (
            <div key={item.id} className="py-3 flex justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">{item.product.name}</p>
                <p className="text-xs text-slate-500">
                  {fmt.qty(item.quantity, item.product.unit)} × {fmt.money(item.unitPrice)}
                  {item.discount > 0 && ` · desc. ${fmt.money(item.discount)}`}
                  {item.returnedQuantity > 0 && ` · devuelto ${fmt.qty(item.returnedQuantity, item.product.unit)}`}
                </p>
              </div>
              <p className="font-medium tabular-nums">{fmt.money(item.subtotal)}</p>
            </div>
          ))}
          <dl className="py-3 space-y-1 text-sm">
            {sale.discount > 0 && (
              <div className="flex justify-between text-slate-600">
                <dt>Descuento general</dt>
                <dd>-{fmt.money(sale.discount)}</dd>
              </div>
            )}
            {sale.amountReceived != null && (
              <div className="flex justify-between text-slate-600">
                <dt>Recibido / cambio</dt>
                <dd>
                  {fmt.money(sale.amountReceived)} / {fmt.money(sale.change)}
                </dd>
              </div>
            )}
            {isOwner && profit !== null && active && (
              <div className="flex justify-between text-slate-600">
                <dt>Utilidad bruta</dt>
                <dd className="text-brand-600 font-medium">{fmt.money(profit)}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {sale.notes && <p className="text-sm text-slate-600">Notas: {sale.notes}</p>}

      {sale.returns.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Devoluciones</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {sale.returns.map((r) => (
              <div key={r.id} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {fmt.dateTime(r.createdAt)} · {PAYMENT_METHOD_LABELS[r.refundMethod]}
                  {r.reason && ` · ${r.reason}`}
                </span>
                <span className="font-medium text-red-600">-{fmt.money(r.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Registrar devolución">
        <div className="space-y-4">
          {sale.items.map((item) => {
            const available = item.quantity - item.returnedQuantity;
            if (available <= 0) return null;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="text-xs text-slate-500">Puede devolver hasta {fmt.qty(available, item.product.unit)}</p>
                </div>
                <input
                  aria-label={`Cantidad a devolver de ${item.product.name}`}
                  inputMode={isFractionalUnit(item.product.unit) ? "decimal" : "numeric"}
                  placeholder="0"
                  value={returnQty[item.id] ?? ""}
                  onChange={(e) => setReturnQty((q) => ({ ...q, [item.id]: e.target.value }))}
                  className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm text-right"
                />
                <span className="text-xs text-slate-500 w-6">{UNIT_LABELS[item.product.unit]}</span>
              </div>
            );
          })}
          <Select
            label="Reembolso"
            value={refundMethod}
            onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
            disabled={sale.paymentMethod === "CREDIT"}
          >
            {sale.paymentMethod === "CREDIT" ? (
              <option value="CREDIT">Descontar del saldo del cliente</option>
            ) : (
              <>
                <option value="CASH">Efectivo (sale de caja)</option>
                <option value="CARD">Tarjeta</option>
                <option value="TRANSFER">Transferencia</option>
                {business.country === "PA" && <option value="YAPPY">Yappy</option>}
              </>
            )}
          </Select>
          <Input
            label="Motivo"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="Opcional"
          />
          <Button className="w-full" onClick={submitReturn} loading={busy}>
            Registrar devolución
          </Button>
        </div>
      </Modal>

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Facturar venta (CFDI 4.0)">
        <div className="space-y-4">
          <Select label="Cliente" value={invoiceCustomer} onChange={(e) => setInvoiceCustomer(e.target.value)}>
            <option value="">Selecciona un cliente con datos fiscales</option>
            {customers
              ?.filter((c) => c.rfc)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName ?? c.name} · {c.rfc}
                </option>
              ))}
          </Select>
          <p className="text-xs text-slate-500">
            ¿No aparece? Agrega RFC, razón social, régimen y C.P. al cliente en{" "}
            <Link href="/clientes" className="underline">
              Clientes
            </Link>
            .
          </p>
          <Select label="Uso del CFDI" value={cfdiUse} onChange={(e) => setCfdiUse(e.target.value)}>
            {CFDI_USES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
          <Button className="w-full" onClick={submitInvoice} loading={busy} disabled={!invoiceCustomer}>
            Timbrar factura
          </Button>
        </div>
      </Modal>
    </div>
  );
}
