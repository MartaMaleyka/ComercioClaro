import { notFound } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getSale, modifierSuffix } from "@/server/sales";
import { formatCurrency, formatDateTime, formatNumber, PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/utils";
import QRCode from "qrcode";
import { PrintButton } from "./PrintButton";
import { countryConfig, includedTax } from "@/lib/country";

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
  const invoice = sale.invoice?.status === "STAMPED" ? sale.invoice : null;
  // Código QR de la factura electrónica (enlace de consulta del PAC/DGI o el CUFE).
  const qrSvg = invoice?.uuid
    ? await QRCode.toString(invoice.qrUrl || invoice.uuid, { type: "svg", margin: 0, errorCorrectionLevel: "M" })
    : null;
  const money = (n: { toNumber(): number } | number | null) =>
    formatCurrency(Number(n ?? 0), b.currency, b.locale, b.showBalboa);
  const country = countryConfig(b.country);
  // Impuesto incluido por tasa (los precios ya lo incluyen); se prorratea el descuento general.
  const factor = sale.subtotal.gt(0) ? sale.total.toNumber() / sale.subtotal.toNumber() : 0;
  const taxByRate = new Map<number, number>();
  for (const i of sale.items) {
    const rate = i.taxRate.toNumber();
    if (rate <= 0) continue;
    const net =
      (i.subtotal.toNumber() * (i.quantity.toNumber() - i.returnedQuantity.toNumber())) / i.quantity.toNumber();
    taxByRate.set(rate, (taxByRate.get(rate) ?? 0) + includedTax(net * factor, rate));
  }

  return (
    <>
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 0; } }`}</style>
      <div className="no-print flex gap-2 justify-center p-3 border-b">
        <PrintButton />
        <a href={`?width=${paper === 58 ? 80 : 58}`} className="px-3 py-1.5 rounded-lg border text-sm">
          Papel de {paper === 58 ? 80 : 58} mm
        </a>
      </div>
      <main className="mx-auto font-mono text-[12px] leading-snug p-2" style={{ width: `${paper}mm` }}>
        <div className="text-center">
          <p className="font-bold text-sm">{b.name}</p>
          {b.address && <p>{b.address}</p>}
          {b.phone && <p>Tel. {b.phone}</p>}
          {country.code === "PA" && b.ruc && (
            <p>
              RUC {b.ruc}
              {b.dv && ` DV ${b.dv}`}
            </p>
          )}
          {country.code === "MX" && b.rfc && <p>RFC {b.rfc}</p>}
        </div>
        <hr className="my-2 border-dashed border-black" />
        <p>Ticket #{sale.folio}</p>
        <p>{formatDateTime(sale.createdAt, b.locale, b.timezone)}</p>
        {sale.customer && <p>Cliente: {sale.customer.name}</p>}
        <hr className="my-2 border-dashed border-black" />
        {sale.items.map((i) => (
          <div key={i.id} className="mb-1">
            <p>
              {i.product.name}
              {modifierSuffix(i.modifiers)}
            </p>
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
        {sale.pointsDiscount.gt(0) && (
          <div className="flex justify-between">
            <span>Puntos ({sale.pointsRedeemed})</span>
            <span>-{money(sale.pointsDiscount)}</span>
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
        {sale.paymentReference && <p>Ref. {sale.paymentReference}</p>}
        {sale.items.some((i) => i.promotionDiscount.gt(0)) && (
          <p>Ahorro en promociones: {money(sale.items.reduce((acc, i) => acc + i.promotionDiscount.toNumber(), 0))}</p>
        )}
        {sale.pointsEarned > 0 && sale.customer && <p>Puntos ganados: {sale.pointsEarned}</p>}
        {[...taxByRate].map(([rate, amount]) => (
          <div key={rate} className="flex justify-between">
            <span>
              {country.taxLabel} {Math.round(rate * 1000) / 10}% incluido
            </span>
            <span>{money(amount)}</span>
          </div>
        ))}
        {sale.change && sale.change.gt(0) && (
          <div className="flex justify-between">
            <span>Cambio</span>
            <span>{money(sale.change)}</span>
          </div>
        )}
        {sale.status === "CANCELLED" && <p className="text-center font-bold mt-2">*** VENTA CANCELADA ***</p>}
        {invoice?.uuid && (
          <>
            <hr className="my-2 border-dashed border-black" />
            <p className="text-center font-bold">
              {country.code === "PA" ? "Comprobante Auxiliar de Factura Electrónica" : "Factura electrónica"}
            </p>
            {invoice.uuid.startsWith("PRUEBA") && <p className="text-center">*** DOCUMENTO DE PRUEBA ***</p>}
            <p className="break-all text-[10px]">
              {country.code === "PA" ? "CUFE" : "UUID"}: {invoice.uuid}
            </p>
            {qrSvg && <div className="w-28 h-28 mx-auto mt-1" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
            {country.code === "PA" && (
              <p className="text-center text-[10px]">Verifique el CUFE en el portal de la DGI</p>
            )}
          </>
        )}
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center">¡Gracias por su compra!</p>
      </main>
    </>
  );
}
