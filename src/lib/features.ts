/**
 * Funciones que el super admin puede habilitar o deshabilitar por plan o por negocio.
 * Lo esencial (vender, caja, inventario, clientes y fiado, compras, gastos, reportes básicos,
 * venta sin conexión) y lo que exige la ley (descuento de jubilado) no se puede desactivar.
 */

/** Grupos en que se ordenan las funciones en el panel del super admin. */
export const FEATURE_GROUPS = [
  { key: "sales", label: "Ventas y cobro" },
  { key: "customers", label: "Clientes y marketing" },
  { key: "inventory", label: "Inventario y compras" },
  { key: "finance", label: "Finanzas y contabilidad" },
  { key: "operations", label: "Operación y equipo" },
] as const;

export type FeatureGroupKey = (typeof FEATURE_GROUPS)[number]["key"];

/**
 * `isNew`: se agregó con las prioridades de la investigación; el panel la marca como nueva para
 * que el super admin la revise en cada plan.
 */
export const FEATURES = [
  { key: "promotions", group: "sales", label: "Promociones", description: "2x1, precio por cantidad y porcentaje." },
  {
    key: "splitPayments",
    group: "sales",
    isNew: true,
    label: "Pagos divididos",
    description: "Cobrar una venta con varias formas de pago (efectivo, tarjeta, Yappy…).",
  },
  { key: "yappyApi", group: "sales", label: "Cobro automático con Yappy", description: "Cobro al celular del cliente con confirmación." },
  { key: "giftCards", group: "sales", label: "Vales (tarjetas de regalo)", description: "Venta de vales y cobro con ellos." },
  { key: "services", group: "sales", label: "Recargas y pago de servicios", description: "Registro de cobros con comisión." },
  {
    key: "scale",
    group: "sales",
    isNew: true,
    label: "Balanza conectada",
    description: "Botón Pesar en el punto de venta y etiquetas de peso EAN-13 de la balanza etiquetadora.",
  },
  { key: "customerDisplay", group: "sales", label: "Pantalla para el cliente", description: "Segundo monitor o tableta." },
  { key: "loyalty", group: "customers", label: "Puntos de lealtad", description: "Los clientes acumulan y canjean puntos." },
  {
    key: "catalog",
    group: "customers",
    label: "Catálogo en línea y pedidos",
    description: "Catálogo público, pedidos por WhatsApp, bandeja de pedidos y zonas de entrega.",
  },
  {
    key: "campaigns",
    group: "customers",
    isNew: true,
    label: "Campañas por WhatsApp y cupones",
    description: "Segmentos de clientes, mensajes personalizados, cupones y resultados.",
  },
  { key: "purchaseOrders", group: "inventory", label: "Órdenes de compra", description: "Pedidos formales al distribuidor." },
  {
    key: "payables",
    group: "inventory",
    isNew: true,
    label: "Cuentas por pagar",
    description: "Compras a crédito, facturas de proveedores, abonos y antigüedad de saldos.",
  },
  {
    key: "recipes",
    group: "inventory",
    isNew: true,
    label: "Recetas e insumos",
    description: "Cada plato descuenta sus insumos al venderse; costo por plato y merma.",
  },
  { key: "variants", group: "inventory", label: "Variantes y extras", description: "Tallas, colores y extras con precio." },
  { key: "inventoryCounts", group: "inventory", label: "Conteo físico", description: "Conteo del anaquel con ajuste de diferencias." },
  { key: "branches", group: "inventory", label: "Sucursales y traspasos", description: "Varias sucursales y mercancía entre ellas." },
  {
    key: "cashflow",
    group: "finance",
    isNew: true,
    label: "Flujo de caja y punto de equilibrio",
    description: "Proyección a 30, 60 y 90 días, gastos recurrentes y ventas necesarias para no perder.",
  },
  {
    key: "accounting",
    group: "finance",
    isNew: true,
    label: "Contabilidad automática",
    description: "Libro diario y mayor, estados financieros, aportes y retiros del dueño y cierre de mes.",
  },
  { key: "einvoice", group: "finance", label: "Factura electrónica con PAC", description: "Emisión automática con CUFE y QR." },
  { key: "reconciliation", group: "finance", label: "Conciliación bancaria", description: "Cruce del estado de cuenta con las ventas." },
  {
    key: "advancedReports",
    group: "finance",
    label: "Reportes avanzados",
    description: "Impuestos del mes (ITBMS/IVA) y desempeño por cajero.",
  },
  { key: "export", group: "finance", label: "Exportar a CSV", description: "Descarga de ventas, productos y movimientos." },
  {
    key: "payroll",
    group: "operations",
    isNew: true,
    label: "Planilla",
    description: "Empleados, CSS, seguro educativo, ISR, décimo tercer mes, vacaciones y comprobantes.",
  },
  {
    key: "restaurant",
    group: "operations",
    label: "Modo restaurante",
    description: "Cuentas abiertas por mesa y pantalla de cocina.",
  },
] as const satisfies readonly {
  key: string;
  group: FeatureGroupKey;
  label: string;
  description: string;
  isNew?: boolean;
}[];

export type FeatureKey = (typeof FEATURES)[number]["key"];

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(key);
}

/** Funciones nuevas (las que el super admin debe revisar en cada plan). */
export const NEW_FEATURE_KEYS = FEATURES.filter((f) => "isNew" in f && f.isNew).map((f) => f.key) as FeatureKey[];

/** Funciones de un grupo, en el orden del catálogo. */
export function featuresInGroup(group: FeatureGroupKey) {
  return FEATURES.filter((f) => f.group === group);
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
