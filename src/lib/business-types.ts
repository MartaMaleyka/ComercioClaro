/**
 * Tipo de negocio que se elige al registrarse: sugiere la configuración inicial y los primeros
 * pasos de la guía. No cambia el plan: las funciones siguen dependiendo del plan.
 */
export const BUSINESS_TYPES = [
  {
    key: "MINISUPER",
    label: "Minisúper o abarrotería",
    hint: "Balanza, compras a crédito con proveedores y alertas de inventario.",
  },
  {
    key: "FONDA",
    label: "Fonda, restaurante o cafetería",
    hint: "Mesas y cocina, recetas con insumos y costo por plato.",
  },
  {
    key: "CARNICERIA",
    label: "Carnicería, pollería o verdulería",
    hint: "Venta por peso con balanza y etiquetas de peso.",
  },
  { key: "TIENDA", label: "Tienda de ropa, calzado o regalos", hint: "Tallas y colores, promociones y vales." },
  {
    key: "FERRETERIA",
    label: "Ferretería o materiales",
    hint: "Órdenes de compra, cuentas por pagar y fiado a clientes.",
  },
  { key: "FARMACIA", label: "Farmacia o perfumería", hint: "Caducidad por lote y descuento de jubilado." },
  { key: "OTRO", label: "Otro tipo de negocio", hint: "Ventas, inventario, caja y clientes." },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]["key"];

export const BUSINESS_TYPE_KEYS = BUSINESS_TYPES.map((t) => t.key) as [BusinessType, ...BusinessType[]];

export function businessTypeLabel(key: string | null | undefined) {
  return BUSINESS_TYPES.find((t) => t.key === key)?.label ?? null;
}

/** Versión vigente de los términos y el aviso de privacidad (se guarda con la aceptación). */
export const TERMS_VERSION = "2026-09";
