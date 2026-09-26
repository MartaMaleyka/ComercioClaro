import { formatCurrency, formatDateTime, formatNumber, PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/utils";
import { countryConfig } from "@/lib/country";
import type { Sale } from "./types";

interface ReceiptBusiness {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  country?: string;
  showBalboa?: boolean;
  ruc?: string | null;
  dv?: string | null;
}

/** Texto del ticket para compartir por WhatsApp (con formato *negritas*). */
export function buildReceiptText(sale: Sale, business: ReceiptBusiness) {
  const money = (n: number) => formatCurrency(n, business.currency, business.locale, business.showBalboa);
  const country = countryConfig(business.country);
  const lines = [
    `*${business.name}*`,
    business.ruc ? `${country.taxIdLabel} ${business.ruc}${business.dv ? ` DV ${business.dv}` : ""}` : null,
    business.address,
    business.phone ? `Tel. ${business.phone}` : null,
    `Ticket #${sale.folio} · ${formatDateTime(sale.createdAt, business.locale, business.timezone)}`,
    "",
    ...sale.items.map(
      (i) =>
        `${formatNumber(i.quantity, business.locale)} ${UNIT_LABELS[i.product.unit] ?? ""} ${i.product.name}  ${money(i.subtotal)}`
    ),
    "",
    sale.discount > 0 ? `Descuento: -${money(sale.discount)}` : null,
    sale.pointsDiscount ? `Puntos canjeados (${sale.pointsRedeemed}): -${money(sale.pointsDiscount)}` : null,
    `*Total: ${money(sale.total)}*`,
    `Pago: ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}${sale.paymentReference ? ` (ref. ${sale.paymentReference})` : ""}`,
    sale.change ? `Cambio: ${money(sale.change)}` : null,
    sale.status === "CANCELLED" ? "VENTA CANCELADA" : null,
    "",
    "¡Gracias por su compra!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

const COUNTRY_CODES: Record<string, string> = {
  MX: "52", GT: "502", SV: "503", HN: "504", NI: "505", CR: "506", PA: "507",
  CO: "57", PE: "51", EC: "593", BO: "591", CL: "56", AR: "54", UY: "598", PY: "595",
  VE: "58", DO: "1", US: "1", ES: "34",
};

/** Enlace de WhatsApp; con teléfono local agrega la lada del país del negocio. */
export function whatsappLink(text: string, phone?: string | null, locale = "es-MX") {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const code = COUNTRY_CODES[locale.split("-")[1] ?? ""] ?? "";
  const number = digits && digits.length <= 10 && code ? `${code}${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
