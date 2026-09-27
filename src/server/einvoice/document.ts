import { D, money, type DecimalLike } from "@/lib/decimal";

/**
 * Documento canónico de factura electrónica de Panamá (SFEP de la DGI).
 * Cada PAC tiene su propio formato de API; los adaptadores traducen desde aquí.
 * Los códigos siguen la Ficha Técnica de la DGI y deben revisarse contra la
 * versión vigente al conectar un PAC real.
 */

/** Código de tasa de ITBMS (gITBMS): 00 exento, 01 7%, 02 10%, 03 15%. */
export function itbmsCode(rate: DecimalLike) {
  const r = D(rate).toNumber();
  if (r === 0) return "00";
  if (Math.abs(r - 0.07) < 1e-6) return "01";
  if (Math.abs(r - 0.1) < 1e-6) return "02";
  if (Math.abs(r - 0.15) < 1e-6) return "03";
  throw new Error(`Tasa de ITBMS no válida para Panamá: ${r * 100}%`);
}

/** Forma de pago (iFormaPago): 01 crédito, 02 efectivo, 03 tarjeta, 08 transferencia, 99 otro. */
export const PAYMENT_CODES: Record<string, { code: string; description?: string }> = {
  CREDIT: { code: "01" },
  CASH: { code: "02" },
  CARD: { code: "03" },
  TRANSFER: { code: "08" },
  YAPPY: { code: "99", description: "Yappy" },
};

/**
 * Formas de pago del documento. En un pago dividido cada forma lleva su parte, prorrateada
 * al total facturado (que ya descuenta las devoluciones); el último absorbe el redondeo.
 */
function documentPayments(sale: SaleForDocument, total: number) {
  const code = (method: string) => PAYMENT_CODES[method] ?? { code: "99" };
  const parts = sale.payments && sale.payments.length > 1 ? sale.payments : null;
  if (!parts) return [{ ...code(sale.paymentMethod === "MIXED" ? "CASH" : sale.paymentMethod), amount: total }];
  const saleTotal = D(sale.total);
  let assigned = D(0);
  return parts.map((p, i) => {
    const amount =
      i === parts.length - 1
        ? money(D(total).minus(assigned))
        : money(saleTotal.gt(0) ? D(p.amount).times(total).div(saleTotal) : D(0));
    assigned = assigned.plus(amount);
    return { ...code(p.method), amount: amount.toNumber() };
  });
}

/** Tipo de receptor (iTipoRec): 01 contribuyente, 02 consumidor final. */
export type ReceiverType = "01" | "02";

export interface PanamaDocumentItem {
  code: string;
  description: string;
  quantity: number;
  /** Precio unitario sin ITBMS */
  unitPrice: number;
  /** Importe sin ITBMS después de descuentos */
  subtotal: number;
  taxRate: number;
  taxCode: string;
  itbms: number;
  /** Importe con ITBMS (lo que pagó el cliente) */
  total: number;
}

export interface PanamaDocument {
  /** 01 = factura de operación interna */
  documentType: "01";
  number: string;
  issueDate: string;
  issuer: { ruc: string; dv: string; name: string; address: string | null; branch: string };
  receiver: { type: ReceiverType; ruc?: string; dv?: string; name: string; email?: string | null };
  items: PanamaDocumentItem[];
  totals: { subtotal: number; itbms: number; total: number };
  payments: { code: string; description?: string; amount: number }[];
}

interface SaleForDocument {
  folio: number;
  createdAt: Date;
  paymentMethod: string;
  /** Formas de pago (pago dividido); sin ellas se usa paymentMethod */
  payments?: { method: string; amount: DecimalLike }[];
  subtotal: DecimalLike;
  total: DecimalLike;
  items: {
    quantity: DecimalLike;
    returnedQuantity: DecimalLike;
    subtotal: DecimalLike;
    taxRate: DecimalLike;
    product: { name: string; barcode: string | null; sku: string | null; id: string };
  }[];
}

interface Party {
  ruc: string | null;
  dv: string | null;
  name: string;
  legalName?: string | null;
  address?: string | null;
  email?: string | null;
}

export function buildPanamaDocument(sale: SaleForDocument, issuer: Party, customer: Party | null): PanamaDocument {
  if (!issuer.ruc || !issuer.dv) {
    throw new Error("Completa el RUC y el DV del negocio en Configuración");
  }
  // Descuento general prorrateado entre las líneas.
  const factor = D(sale.subtotal).gt(0) ? D(sale.total).div(sale.subtotal) : D(0);

  const items: PanamaDocumentItem[] = [];
  for (const item of sale.items) {
    const quantity = D(item.quantity).minus(item.returnedQuantity);
    if (quantity.lte(0)) continue;
    const total = money(D(item.subtotal).div(item.quantity).times(quantity).times(factor));
    const rate = D(item.taxRate);
    const subtotal = money(total.div(D(1).plus(rate)));
    const itbms = total.minus(subtotal);
    items.push({
      code: item.product.sku ?? item.product.barcode ?? item.product.id.slice(0, 20),
      description: item.product.name.slice(0, 500),
      quantity: quantity.toNumber(),
      unitPrice: subtotal.div(quantity).toDecimalPlaces(6).toNumber(),
      subtotal: subtotal.toNumber(),
      taxRate: rate.toNumber(),
      taxCode: itbmsCode(rate),
      itbms: itbms.toNumber(),
      total: total.toNumber(),
    });
  }
  if (items.length === 0) throw new Error("La venta no tiene importes por facturar");

  const sum = (key: "subtotal" | "itbms" | "total") => money(items.reduce((acc, i) => acc.plus(i[key]), D(0))).toNumber();
  const totals = { subtotal: sum("subtotal"), itbms: sum("itbms"), total: sum("total") };
  const payments = documentPayments(sale, totals.total);

  const hasRuc = Boolean(customer?.ruc && customer?.dv);
  return {
    documentType: "01",
    number: String(sale.folio).padStart(10, "0"),
    issueDate: sale.createdAt.toISOString(),
    issuer: {
      ruc: issuer.ruc,
      dv: issuer.dv,
      name: issuer.legalName || issuer.name,
      address: issuer.address ?? null,
      branch: "0000",
    },
    receiver: hasRuc
      ? {
          type: "01",
          ruc: customer!.ruc!,
          dv: customer!.dv!,
          name: customer!.legalName || customer!.name,
          email: customer!.email ?? null,
        }
      : { type: "02", name: customer?.name ?? "Consumidor final", email: customer?.email ?? null },
    items,
    totals,
    payments,
  };
}
