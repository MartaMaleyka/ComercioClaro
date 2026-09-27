"use client";

import { createContext, useContext } from "react";
import type { AccessState, FeatureKey } from "@/lib/features";
import type { WeightBarcodeFormat } from "@/lib/scale";

export interface SessionBusiness {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  country: string;
  showBalboa: boolean;
  ruc: string | null;
  dv: string | null;
  rfc: string | null;
  yappyDirectory: string | null;
  hasYappyQr: boolean;
  catalogEnabled: boolean;
  restaurantMode: boolean;
  usesFreeInvoicer: boolean;
  einvoiceMode: string;
  autoInvoice: boolean;
  yappyMode: string;
  loyaltyEnabled: boolean;
  loyaltyPointValue: number;
  /** Descuento de jubilado (Ley 6 en Panamá); 0 = no se ofrece */
  seniorDiscountRate: number;
  /** Días que se aceptan ventas guardadas sin conexión */
  offlineDays: number;
  /** Cómo leer las etiquetas de peso de la balanza (prefijo 20-29) */
  weightBarcode: WeightBarcodeFormat;
  region: string | null;
  /** Funciones del plan activas en el negocio */
  features: FeatureKey[];
  plan: { name: string; code: string } | null;
  access: AccessState;
  onlineBilling: boolean;
}

export interface SessionData {
  user: { id: string; name: string; email: string; language: string; isSuperAdmin: boolean; emailVerified: boolean };
  /** El super admin está dentro del negocio como soporte */
  support: boolean;
  role: "OWNER" | "CASHIER";
  business: SessionBusiness;
  businesses: { id: string; name: string; role: "OWNER" | "CASHIER" }[];
}

export const SessionContext = createContext<SessionData | null>(null);

export function SessionProvider({ value, children }: { value: SessionData; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}

/** ¿El plan del negocio incluye la función? */
export function useFeature(feature: FeatureKey) {
  return useSession().business.features.includes(feature);
}

export function useIsOwner() {
  return useSession().role === "OWNER";
}
