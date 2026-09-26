/**
 * Configuración por país: impuestos, moneda, formatos y documento fiscal.
 * Los precios siempre incluyen impuestos; las tasas se usan para desglosar.
 */

export type CountryCode = "MX" | "PA" | "OTHER";

export interface TaxRateOption {
  value: number;
  label: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  /** Nombre del impuesto al consumo (IVA, ITBMS...) */
  taxLabel: string;
  taxRates: TaxRateOption[];
  defaultTaxRate: number;
  /** México: IEPS y claves SAT */
  hasIeps: boolean;
  /** Nombre del identificador fiscal (RFC, RUC) */
  taxIdLabel: string;
  /** Tipo de facturación electrónica soportada */
  invoicing: "cfdi" | "dgi" | "none";
  showBalboa: boolean;
  /** Formas de pago que se muestran en el punto de venta */
  paymentMethods: ("CASH" | "CARD" | "TRANSFER" | "YAPPY" | "CREDIT")[];
}

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  MX: {
    code: "MX",
    name: "México",
    currency: "MXN",
    locale: "es-MX",
    timezone: "America/Mexico_City",
    taxLabel: "IVA",
    taxRates: [
      { value: 0.16, label: "16%" },
      { value: 0.08, label: "8% (frontera)" },
      { value: 0, label: "0% (alimentos, medicinas)" },
    ],
    defaultTaxRate: 0.16,
    hasIeps: true,
    taxIdLabel: "RFC",
    invoicing: "cfdi",
    showBalboa: false,
    paymentMethods: ["CASH", "CARD", "TRANSFER", "CREDIT"],
  },
  PA: {
    code: "PA",
    name: "Panamá",
    currency: "USD",
    locale: "es-PA",
    timezone: "America/Panama",
    taxLabel: "ITBMS",
    taxRates: [
      { value: 0.07, label: "7% (tasa general)" },
      { value: 0.1, label: "10% (bebidas alcohólicas)" },
      { value: 0.15, label: "15% (tabaco)" },
      { value: 0, label: "Exento (canasta básica, medicinas)" },
    ],
    defaultTaxRate: 0.07,
    hasIeps: false,
    taxIdLabel: "RUC",
    invoicing: "dgi",
    showBalboa: true,
    paymentMethods: ["CASH", "YAPPY", "CARD", "TRANSFER", "CREDIT"],
  },
  OTHER: {
    code: "OTHER",
    name: "Otro país",
    currency: "USD",
    locale: "es-US",
    timezone: "America/New_York",
    taxLabel: "Impuesto",
    taxRates: [
      { value: 0, label: "Sin impuesto" },
      { value: 0.05, label: "5%" },
      { value: 0.1, label: "10%" },
      { value: 0.12, label: "12%" },
      { value: 0.13, label: "13%" },
      { value: 0.15, label: "15%" },
      { value: 0.18, label: "18%" },
      { value: 0.19, label: "19%" },
    ],
    defaultTaxRate: 0,
    hasIeps: false,
    taxIdLabel: "ID fiscal",
    invoicing: "none",
    showBalboa: false,
    paymentMethods: ["CASH", "CARD", "TRANSFER", "CREDIT"],
  },
};

export function countryConfig(code: string | null | undefined): CountryConfig {
  return COUNTRIES[(code as CountryCode) ?? "MX"] ?? COUNTRIES.OTHER;
}

/** Límites del facturador gratuito de la DGI de Panamá (Resolución 201-6299, desde 2026). */
export const DGI_FREE_INVOICER_LIMITS = {
  annualRevenue: 36_000,
  monthlyDocuments: 100,
  warningRatio: 0.8,
};

/** Monto de impuesto contenido en un precio con impuesto incluido. */
export function includedTax(amountWithTax: number, rate: number) {
  if (rate <= 0) return 0;
  return Math.round(((amountWithTax * rate) / (1 + rate)) * 100) / 100;
}
