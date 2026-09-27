/**
 * Funciones que el super admin puede habilitar o deshabilitar por plan o por negocio.
 * Lo esencial (vender, caja, inventario, clientes y fiado, compras, gastos, reportes básicos,
 * venta sin conexión) y lo que exige la ley (descuento de jubilado) no se puede desactivar.
 */

export const FEATURES = [
  { key: "promotions", label: "Promociones", description: "2x1, precio por cantidad y porcentaje." },
  { key: "loyalty", label: "Puntos de lealtad", description: "Los clientes acumulan y canjean puntos." },
  {
    key: "catalog",
    label: "Catálogo en línea y pedidos",
    description: "Catálogo público, pedidos por WhatsApp, bandeja de pedidos y zonas de entrega.",
  },
  { key: "yappyApi", label: "Cobro automático con Yappy", description: "Cobro al celular del cliente con confirmación." },
  { key: "einvoice", label: "Factura electrónica con PAC", description: "Emisión automática con CUFE y QR." },
  {
    key: "restaurant",
    label: "Modo restaurante",
    description: "Cuentas abiertas por mesa y pantalla de cocina.",
  },
  { key: "customerDisplay", label: "Pantalla para el cliente", description: "Segundo monitor o tableta." },
  { key: "giftCards", label: "Vales (tarjetas de regalo)", description: "Venta de vales y cobro con ellos." },
  { key: "services", label: "Recargas y pago de servicios", description: "Registro de cobros con comisión." },
  { key: "purchaseOrders", label: "Órdenes de compra", description: "Pedidos formales al distribuidor." },
  { key: "branches", label: "Sucursales y traspasos", description: "Varias sucursales y mercancía entre ellas." },
  { key: "reconciliation", label: "Conciliación bancaria", description: "Cruce del estado de cuenta con las ventas." },
  {
    key: "advancedReports",
    label: "Reportes avanzados",
    description: "Impuestos del mes (ITBMS/IVA) y desempeño por cajero.",
  },
  { key: "variants", label: "Variantes y extras", description: "Tallas, colores y extras con precio." },
  { key: "inventoryCounts", label: "Conteo físico", description: "Conteo del anaquel con ajuste de diferencias." },
  { key: "export", label: "Exportar a CSV", description: "Descarga de ventas, productos y movimientos." },
  {
    key: "recipes",
    label: "Recetas e insumos",
    description: "Cada plato descuenta sus insumos al venderse; costo por plato y merma.",
  },
  {
    key: "cashflow",
    label: "Flujo de caja y punto de equilibrio",
    description: "Proyección a 30, 60 y 90 días, gastos recurrentes y ventas necesarias para no perder.",
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(key);
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

/**
 * Funciones activas de un negocio: las del plan más los ajustes manuales del super admin.
 * Un negocio sin plan (creado antes de los planes) conserva todas las funciones.
 */
export function resolveFeatures(business: {
  plan: { features: string[] } | null;
  featureOverrides: unknown;
}): FeatureKey[] {
  const base = new Set<FeatureKey>(business.plan ? business.plan.features.filter(isFeatureKey) : FEATURE_KEYS);
  const overrides = parseOverrides(business.featureOverrides);
  for (const [key, enabled] of Object.entries(overrides) as [FeatureKey, boolean][]) {
    if (enabled) base.add(key);
    else base.delete(key);
  }
  return FEATURE_KEYS.filter((k) => base.has(k));
}

export function parseOverrides(value: unknown): FeatureOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: FeatureOverrides = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (isFeatureKey(key) && typeof enabled === "boolean") result[key] = enabled;
  }
  return result;
}

export type AccessState =
  | { blocked: false; warning: null | { kind: "trial"; daysLeft: number } | { kind: "overdue"; since: string } }
  | { blocked: true; reason: "suspended" | "trialEnded"; message: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Si el negocio puede usarse, y qué aviso mostrar (prueba por terminar o pago vencido). */
export function accessState(
  business: { status: string; trialEndsAt: Date | null; paidUntil: Date | null; suspendedReason: string | null },
  now = new Date()
): AccessState {
  if (business.status === "SUSPENDED") return { blocked: true, reason: "suspended", message: business.suspendedReason };
  if (business.status === "TRIAL" && business.trialEndsAt) {
    if (business.trialEndsAt.getTime() <= now.getTime()) return { blocked: true, reason: "trialEnded", message: null };
    const daysLeft = Math.ceil((business.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    return { blocked: false, warning: daysLeft <= 7 ? { kind: "trial", daysLeft } : null };
  }
  // Pago vencido: solo aviso. Suspender es una decisión del super admin.
  if (business.status === "ACTIVE" && business.paidUntil && business.paidUntil.getTime() < now.getTime()) {
    return { blocked: false, warning: { kind: "overdue", since: business.paidUntil.toISOString() } };
  }
  return { blocked: false, warning: null };
}
