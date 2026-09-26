import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getSale } from "@/server/sales";
import { formatCurrency, formatDateTime, formatNumber, PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/utils";
import { PrintButton } from "./PrintButton";

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ width?: string }>;
}) {
  const auth = await getAuth();
  if (!auth) notFound();
  const { id } = await params;
  const { width } = await searchParams;
  const paper = width === "80" ? 80 : 58;

  let sale;
  try {
    sale = await getSale(auth.businessId, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }

  const b = auth.business;
  const money = (n: { toNumber(): number } | number | null) => formatCurrency(Number(n ?? 0), b.currency, b.locale);

  return (
    <>
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 0; } }`}</style>
      <div className="no-print flex gap-2 justify-center p-3 border-b">
        <PrintButton />
        <a href={`?width=${paper === 58 ? 80 : 58}`} className="px-3 py-1.5 rounded-lg border text-sm">
          Papel de {paper === 58 ? 80 : 58} mm
        </a>
      </div>
      <main
        className="mx-auto font-mono text-[12px] leading-snug p-2"
        style={{ width: `${paper}mm` }}
      >
        <div className="text-center">
          <p className="font-bold text-sm">{b.name}</p>
          {b.address && <p>{b.address}</p>}
          {b.phone && <p>Tel. {b.phone}</p>}
          {b.rfc && <p>RFC {b.rfc}</p>}
        </div>
        <hr className="my-2 border-dashed border-black" />
        <p>Ticket #{sale.folio}</p>
        <p>{formatDateTime(sale.createdAt, b.locale, b.timezone)}</p>
        {sale.customer && <p>Cliente: {sale.customer.name}</p>}
        <hr className="my-2 border-dashed border-black" />
        {sale.items.map((i) => (
          <div key={i.id} className="mb-1">
            <p>{i.product.name}</p>
            <div className="flex justify-between">
              <span>
                {formatNumber(i.quantity.toNumber(), b.locale)} {UNIT_LABELS[i.product.unit]} x {money(i.unitPrice)}
              </span>
              <span>{money(i.subtotal)}</span>
            </div>
            {i.discount.gt(0) && <p className="text-right">desc. -{money(i.discount)}</p>}
          </div>
        ))}
        <hr className="my-2 border-dashed border-black" />
        {sale.discount.gt(0) && (
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{money(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>{money(sale.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
          <span>{sale.amountReceived ? money(sale.amountReceived) : ""}</span>
        </div>
        {sale.change && sale.change.gt(0) && (
          <div className="flex justify-between">
            <span>Cambio</span>
            <span>{money(sale.change)}</span>
          </div>
        )}
        {sale.status === "CANCELLED" && <p className="text-center font-bold mt-2">*** VENTA CANCELADA ***</p>}
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center">¡Gracias por su compra!</p>
      </main>
    </>
  );
}
