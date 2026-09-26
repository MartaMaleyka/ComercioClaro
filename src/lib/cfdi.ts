import { D, money, type DecimalLike } from "./decimal";

/**
 * Construcción de conceptos CFDI 4.0 a partir de importes con impuestos incluidos.
 * Formato de la API Web de Facturama (https://apisandbox.facturama.mx/guias).
 */

export interface CfdiTax {
  Name: "IVA" | "IEPS";
  Rate: number;
  Base: number;
  Total: number;
  IsRetention: false;
}

export interface CfdiItem {
  ProductCode: string;
  IdentificationNumber?: string;
  Description: string;
  Unit: string;
  UnitCode: string;
  UnitPrice: number;
  Quantity: number;
  Subtotal: number;
  TaxObject: "02";
  Taxes: CfdiTax[];
  Total: number;
}

export const PUBLIC_RFC = "XAXX010101000";

export const PAYMENT_FORM: Record<string, string> = {
  CASH: "01",
  TRANSFER: "03",
  CARD: "04",
  CREDIT: "99",
};

export const UNIT_NAMES: Record<string, string> = {
  H87: "Pieza",
  KGM: "Kilogramo",
  GRM: "Gramo",
  LTR: "Litro",
  MLT: "Mililitro",
  MTR: "Metro",
  ACT: "Actividad",
  E48: "Unidad de servicio",
};

/**
 * Desglosa un importe con impuestos incluidos. El IEPS forma parte de la base del IVA.
 */
export function buildItem(input: {
  totalWithTax: DecimalLike;
  quantity: DecimalLike;
  taxRate: DecimalLike;
  iepsRate: DecimalLike;
  productCode: string;
  unitCode: string;
  description: string;
  identification?: string;
}): CfdiItem {
  const total = money(input.totalWithTax);
  const iva = D(input.taxRate);
  const ieps = D(input.iepsRate);
  const base = money(total.div(D(1).plus(ieps).times(D(1).plus(iva))));
  const iepsTotal = money(base.times(ieps));
  const ivaBase = base.plus(iepsTotal);
  // El IVA absorbe la diferencia de redondeo para que el total cuadre con lo cobrado.
  const ivaTotal = total.minus(base).minus(iepsTotal);

  const taxes: CfdiTax[] = [];
  if (ieps.gt(0)) {
    taxes.push({ Name: "IEPS", Rate: ieps.toNumber(), Base: base.toNumber(), Total: iepsTotal.toNumber(), IsRetention: false });
  }
  taxes.push({
    Name: "IVA",
    Rate: iva.toNumber(),
    Base: ivaBase.toNumber(),
    Total: money(ivaTotal).toNumber(),
    IsRetention: false,
  });

  const quantity = D(input.quantity);
  return {
    ProductCode: input.productCode,
    IdentificationNumber: input.identification,
    Description: input.description.slice(0, 1000),
    Unit: UNIT_NAMES[input.unitCode] ?? "Pieza",
    UnitCode: input.unitCode,
    UnitPrice: base.div(quantity).toDecimalPlaces(6).toNumber(),
    Quantity: quantity.toNumber(),
    Subtotal: base.toNumber(),
    TaxObject: "02",
    Taxes: taxes,
    Total: total.toNumber(),
  };
}

/** Clave SAT de periodicidad → texto. */
export const PERIODICITY_LABELS: Record<string, string> = {
  "01": "Diaria",
  "02": "Semanal",
  "03": "Quincenal",
  "04": "Mensual",
  "05": "Bimestral",
};
