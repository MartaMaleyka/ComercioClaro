import { z } from "zod";
import { CASH_DENOMINATIONS } from "./cash";
import { isValidTimeZone } from "./dates";

const MAX_MONEY = 99_999_999;
const MAX_QTY = 1_000_000;

const number = z.coerce.number({ error: "Debe ser un número" }).refine(Number.isFinite, "Debe ser un número");

export const moneyInput = number.min(0, "No puede ser negativo").max(MAX_MONEY, "Monto demasiado grande");
export const positiveMoney = number.gt(0, "Debe ser mayor a 0").max(MAX_MONEY, "Monto demasiado grande");
export const positiveQty = number.gt(0, "La cantidad debe ser mayor a 0").max(MAX_QTY, "Cantidad demasiado grande");
export const nonNegativeQty = number.min(0, "No puede ser negativo").max(MAX_QTY, "Cantidad demasiado grande");
export const rate = number.min(0).max(1, "La tasa debe estar entre 0 y 1");

const id = z.string().min(1).max(64);

/** Texto opcional: recorta espacios y convierte vacío en null. */
const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

const text = (max = 200, message = "Este campo es obligatorio") =>
  z.string({ error: message }).trim().min(1, message).max(max, `Máximo ${max} caracteres`);

export const email = z
  .string({ error: "El correo es obligatorio" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo inválido"));

export const password = z
  .string({ error: "La contraseña es obligatoria" })
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña es demasiado larga");

export const paymentMethod = z.enum(["CASH", "CARD", "TRANSFER", "CREDIT", "YAPPY", "GIFT_CARD"], { error: "Forma de pago inválida" });
export const immediatePaymentMethod = z.enum(["CASH", "CARD", "TRANSFER", "YAPPY"], { error: "Forma de pago inválida" });
export const country = z.enum(["MX", "PA", "OTHER"], { error: "País inválido" });
const feeRate = number.min(0).max(0.2, "La comisión debe estar entre 0% y 20%");

/** RUC panameño (persona natural, jurídica, extranjero...) y dígito verificador. */
const ruc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([0-9A-Z]{1,12}-){0,4}[0-9A-Z]{1,12}$/, "RUC inválido")
  .max(30)
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);
const dv = z
  .string()
  .trim()
  .regex(/^(\d{1,2})?$/, "DV inválido")
  .nullish()
  .transform((v) => v || null);
export const productUnit = z.enum(["PIECE", "KG", "G", "L", "ML", "M", "LB", "OZ", "GAL"], { error: "Unidad inválida" });
export const adjustmentReason = z.enum(["COUNT", "WASTE", "EXPIRED", "THEFT", "DAMAGED", "OTHER"], {
  error: "Motivo inválido",
});

// ---------- Autenticación ----------

export const registerSchema = z.object({
  email,
  password,
  name: text(100, "Tu nombre es obligatorio"),
  businessName: text(120, "El nombre del negocio es obligatorio"),
  country: country.default("MX"),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria").max(128),
});

export const resetRequestSchema = z.object({ email });

export const resetConfirmSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "El enlace de recuperación no es válido"),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
  newPassword: password,
});

// ---------- Negocio, sucursales y usuarios ----------

export const businessSchema = z.object({
  name: text(120).optional(),
  description: optText(),
  phone: optText(30),
  address: optText(300),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moneda inválida")
    .optional(),
  locale: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Idioma/país inválido")
    .optional(),
  timezone: z.string().trim().refine(isValidTimeZone, "Zona horaria inválida").optional(),
  lowStockEmailAlerts: z.boolean().optional(),
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})?$/, "RFC inválido")
    .nullish()
    .transform((v) => v || null),
  legalName: optText(300),
  taxRegime: z
    .string()
    .trim()
    .regex(/^(\d{3})?$/, "Régimen fiscal inválido")
    .nullish()
    .transform((v) => v || null),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, "Código postal inválido")
    .nullish()
    .transform((v) => v || null),
  userName: text(100).optional(),
  country: country.optional(),
  showBalboa: z.boolean().optional(),
  ruc,
  dv,
  usesFreeInvoicer: z.boolean().optional(),
  yappyDirectory: optText(60),
  yappyQr: z
    .string()
    .max(400_000, "La imagen del QR es demasiado grande (máximo 300 KB)")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Imagen de QR inválida")
    .nullish()
    .or(z.literal(""))
    .transform((v) => v || null),
  yappyMode: z.enum(["STATIC", "API"]).optional(),
  einvoiceMode: z.enum(["OFF", "MANUAL", "PAC"]).optional(),
  einvoiceProvider: z.enum(["alanube", "simulado"]).nullish(),
  autoInvoice: z.boolean().optional(),
  invoicePerSale: z.boolean().optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyPointsPerUnit: number.min(0).max(1000).optional(),
  loyaltyPointValue: number.min(0).max(100).optional(),
  catalogEnabled: z.boolean().optional(),
  catalogSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Usa solo minúsculas, números y guiones")
    .max(60)
    .nullish()
    .transform((v) => v || null),
  catalogWhatsapp: optText(30),
  cardFeeRate: feeRate.optional(),
  transferFeeRate: feeRate.optional(),
  yappyFeeRate: feeRate.optional(),
  serviceProviders: z.lazy(() => serviceProvidersSchema).optional(),
  restaurantMode: z.boolean().optional(),
  region: z.enum(["CAPITAL", "INTERIOR"]).nullish(),
  offlineDays: z.coerce.number().int().min(1, "Mínimo 1 día").max(60, "Máximo 60 días").optional(),
  seniorDiscountRate: rate.optional(),
  deliveryZones: z.lazy(() => deliveryZonesSchema).optional(),
});

export const languageSchema = z.object({ language: z.enum(["es", "zh", "en"]) });

export const branchSchema = z.object({
  name: text(120, "El nombre de la sucursal es obligatorio"),
  copyCatalog: z.boolean().default(true),
});

export const switchBusinessSchema = z.object({ businessId: id });

export const memberSchema = z.object({
  name: text(100, "El nombre es obligatorio"),
  email,
  role: z.enum(["OWNER", "CASHIER"]).default("CASHIER"),
});

// ---------- Catálogo ----------

export const categorySchema = z.object({ name: text(60, "El nombre de la categoría es obligatorio") });

const productBase = {
  name: text(150, "El nombre es obligatorio"),
  description: optText(),
  sku: optText(60),
  barcode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[\w\-.]*$/, "Código de barras inválido")
    .nullish()
    .transform((v) => v || null),
  unit: productUnit.default("PIECE"),
  price: moneyInput,
  wholesalePrice: moneyInput.nullish(),
  wholesaleMinQty: positiveQty.nullish(),
  cost: moneyInput.default(0),
  minStock: nonNegativeQty.default(5),
  trackExpiry: z.boolean().default(false),
  packSize: z.coerce.number().int().min(2, "Mínimo 2 unidades por caja").max(10000).nullish(),
  // Sin valor se usa la tasa por defecto del país del negocio.
  taxRate: rate.optional(),
  iepsRate: rate.default(0),
  satProductKey: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "Clave SAT de producto inválida")
    .default("01010101"),
  satUnitKey: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,3}$/, "Clave SAT de unidad inválida")
    .default("H87"),
  categoryId: id.nullish(),
  variantGroup: optText(150).optional(),
  sendToKitchen: z.boolean().optional(),
  trackStock: z.boolean().optional(),
  seniorEligible: z.boolean().optional(),
  variantLabel: optText(60).optional(),
  modifiers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: text(60, "Escribe el nombre del extra"),
        price: moneyInput,
      })
    )
    .max(30, "Máximo 30 extras por producto")
    .refine((list) => new Set(list.map((m) => m.id)).size === list.length, "Hay extras repetidos")
    .nullish(),
};

export const productCreateSchema = z.object({
  ...productBase,
  stock: nonNegativeQty.default(0),
});

export const productUpdateSchema = z
  .object({
    ...productBase,
    archived: z.boolean(),
  })
  .partial();

export const stockAdjustmentSchema = z.object({
  mode: z.enum(["set", "delta"]),
  quantity: number.min(-MAX_QTY).max(MAX_QTY),
  reason: adjustmentReason,
  notes: optText(300),
});

// ---------- Promociones ----------

export const promotionSchema = z
  .object({
    name: text(80, "El nombre es obligatorio"),
    type: z.enum(["PERCENT", "BUY_X_PAY_Y", "BUNDLE_PRICE"]),
    percent: number.gt(0).max(1).nullish(),
    buyQty: z.coerce.number().int().min(2).max(100).nullish(),
    payQty: z.coerce.number().int().min(0).max(99).nullish(),
    bundleQty: z.coerce.number().int().min(2).max(1000).nullish(),
    bundlePrice: positiveMoney.nullish(),
    productId: id.nullish(),
    categoryId: id.nullish(),
    startsAt: z.coerce.date().nullish(),
    endsAt: z.coerce.date().nullish(),
    active: z.boolean().default(true),
  })
  .refine((p) => Boolean(p.productId) !== Boolean(p.categoryId), {
    message: "Elige un producto o una categoría",
    path: ["productId"],
  })
  .refine((p) => p.type !== "PERCENT" || p.percent != null, { message: "Indica el porcentaje", path: ["percent"] })
  .refine((p) => p.type !== "BUY_X_PAY_Y" || (p.buyQty != null && p.payQty != null && p.payQty < p.buyQty), {
    message: "Indica cuántos lleva y cuántos paga (paga menos de los que lleva)",
    path: ["buyQty"],
  })
  .refine((p) => p.type !== "BUNDLE_PRICE" || (p.bundleQty != null && p.bundlePrice != null), {
    message: "Indica la cantidad y el precio del paquete",
    path: ["bundleQty"],
  })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt <= p.endsAt, {
    message: "La fecha final debe ser posterior a la inicial",
    path: ["endsAt"],
  });

// ---------- Ventas ----------

export const saleSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(64).nullish(),
  items: z
    .array(
      z.object({
        productId: id,
        quantity: positiveQty,
        unitPrice: moneyInput.nullish(),
        discount: moneyInput.default(0),
        modifierIds: z.array(z.string().max(40)).max(20).optional(),
      })
    )
    .min(1, "Agrega al menos un producto")
    .max(200, "Demasiados productos en una venta"),
  discount: moneyInput.default(0),
  paymentMethod: paymentMethod.default("CASH"),
  amountReceived: moneyInput.nullish(),
  paymentReference: optText(60),
  yappyChargeId: id.nullish(),
  onlineOrderId: id.nullish(),
  openOrderId: id.nullish(),
  giftCardCode: optText(40),
  redeemPoints: z.coerce.number().int().min(0).max(10_000_000).nullish(),
  customerId: id.nullish(),
  senior: z.boolean().default(false),
  seniorId: optText(30),
  notes: optText(),
  createdAt: z.coerce.date().nullish(),
});

export const cancelSchema = z.object({
  reason: text(300, "Indica el motivo de la cancelación"),
});

export const saleReturnSchema = z.object({
  items: z
    .array(z.object({ saleItemId: id, quantity: positiveQty }))
    .min(1, "Selecciona al menos un producto a devolver"),
  reason: optText(300),
  refundMethod: paymentMethod.default("CASH"),
});

// ---------- Compras y proveedores ----------

export const purchaseSchema = z.object({
  items: z
    .array(
      z.object({
        productId: id,
        quantity: positiveQty,
        unitCost: moneyInput.nullish(),
        lotCode: optText(60),
        expiresAt: z.coerce.date().nullish(),
      })
    )
    .min(1, "Agrega al menos un producto")
    .max(500),
  supplierId: id.nullish(),
  supplierName: optText(150),
  notes: optText(),
  paidFromCash: z.boolean().default(false),
});

export const supplierSchema = z.object({
  name: text(150, "El nombre es obligatorio"),
  contact: optText(150),
  phone: optText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.email("Correo inválido"), z.literal("")]))
    .nullish()
    .transform((v) => v || null),
  notes: optText(),
});

// ---------- Clientes (fiado) ----------

export const customerSchema = z.object({
  name: text(150, "El nombre es obligatorio"),
  phone: optText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.email("Correo inválido"), z.literal("")]))
    .nullish()
    .transform((v) => v || null),
  notes: optText(),
  creditLimit: moneyInput.default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(15),
  creditTerm: z.enum(["DAYS", "QUINCENA", "FIXED"]).default("DAYS"),
  creditDueDate: z.coerce.date().nullish(),
  isSenior: z.boolean().default(false),
  seniorId: optText(30),
  ruc,
  dv,
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})?$/, "RFC inválido")
    .nullish()
    .transform((v) => v || null),
  legalName: optText(300),
  taxRegime: z
    .string()
    .trim()
    .regex(/^(\d{3})?$/, "Régimen fiscal inválido")
    .nullish()
    .transform((v) => v || null),
  postalCode: z
    .string()
    .trim()
    .regex(/^(\d{5})?$/, "Código postal inválido")
    .nullish()
    .transform((v) => v || null),
});

export const customerPaymentSchema = z.object({
  amount: positiveMoney,
  method: immediatePaymentMethod.default("CASH"),
  notes: optText(),
});

// ---------- Caja y gastos ----------

export const cashOpenSchema = z.object({ openingAmount: moneyInput, notes: optText() });

export const cashMovementSchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: positiveMoney,
  reason: text(200, "Indica el motivo"),
});

export const cashCloseSchema = z.object({
  countedAmount: moneyInput,
  notes: optText(),
  countBreakdown: z
    .array(
      z.object({
        value: z.coerce
          .number()
          .refine((v) => (CASH_DENOMINATIONS as readonly number[]).includes(v), "Denominación inválida"),
        count: z.coerce.number().int().min(0).max(100_000),
      })
    )
    .max(CASH_DENOMINATIONS.length)
    .nullish(),
});

export const expenseSchema = z.object({
  category: text(60, "La categoría es obligatoria"),
  description: optText(),
  amount: positiveMoney,
  paymentMethod: immediatePaymentMethod.default("CASH"),
  date: z.coerce.date().nullish(),
});

// ---------- Facturación ----------

export const invoiceSaleSchema = z.object({
  saleId: id,
  customerId: id,
  cfdiUse: z.string().trim().regex(/^[A-Z]\d{2}$/, "Uso de CFDI inválido").default("G03"),
  paymentForm: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
});

export const externalInvoiceSchema = z.object({
  saleId: id,
  cufe: z
    .string()
    .trim()
    .min(10, "El CUFE es demasiado corto")
    .max(120, "El CUFE es demasiado largo")
    .regex(/^[A-Za-z0-9-]+$/, "El CUFE solo lleva letras, números y guiones"),
  customerId: id.nullish(),
});

export const globalInvoiceSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  periodicity: z.enum(["01", "02", "03", "04", "05"]).default("01"),
});

// ---------- Consultas ----------

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
  paymentMethod: paymentMethod.optional(),
});

export const reportQuerySchema = z.object({
  period: z.coerce.number().int().min(1).max(366).default(30),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  scope: z.enum(["business", "all"]).default("business"),
});

export const translationFeedbackSchema = z.object({
  screen: z.string().trim().max(200).default(""),
  original: z.string().trim().min(1, "Escribe el texto que viste").max(500),
  suggestion: z.string().trim().min(1, "Escribe cómo debería decir").max(500),
});

export const monthQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido")
    .optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const onlineOrderSchema = z.object({
  customerName: text(80, "Escribe tu nombre"),
  phone: optText(30),
  notes: optText(300),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]).default("PICKUP"),
  address: optText(300),
  deliveryZone: optText(60),
  items: z
    .array(z.object({ productId: id, quantity: z.coerce.number().gt(0).max(999) }))
    .min(1, "Agrega al menos un producto")
    .max(100, "Demasiados productos en un pedido"),
});

export const onlineOrderStatusSchema = z.object({
  status: z.enum(["ACCEPTED", "READY", "DELIVERED", "CANCELLED"]),
});

export const purchaseOrderSchema = z.object({
  supplierId: id.nullish(),
  supplierName: optText(150),
  notes: optText(),
  expectedAt: z.coerce.date().nullish(),
  lines: z
    .array(z.object({ productId: id, quantity: positiveQty, unitCost: moneyInput.nullish() }))
    .min(1, "Agrega al menos un producto")
    .max(300),
});

export const purchaseOrderReceiveSchema = z.object({
  paidFromCash: z.boolean().default(false),
  notes: optText(),
  lines: z
    .array(
      z.object({
        lineId: id,
        quantity: nonNegativeQty,
        unitCost: moneyInput.nullish(),
        lotCode: optText(60),
        expiresAt: z.coerce.date().nullish(),
      })
    )
    .min(1)
    .max(300),
});

export const transferSchema = z.object({
  toBusinessId: id,
  notes: optText(),
  lines: z
    .array(z.object({ productId: id, quantity: positiveQty }))
    .min(1, "Agrega al menos un producto")
    .max(300),
});

export const serviceKind = z.enum(["RECHARGE", "BILL", "OTHER"]);

export const serviceProvidersSchema = z
  .array(
    z.object({
      name: text(60, "Escribe el nombre del proveedor"),
      kind: serviceKind,
      commissionRate: rate,
    })
  )
  .max(40);

export const deliveryZonesSchema = z
  .array(
    z.object({
      name: text(60, "Escribe el nombre de la zona"),
      fee: moneyInput,
      productId: id.nullish(),
    })
  )
  .max(40);

export const serviceSaleSchema = z.object({
  kind: serviceKind,
  provider: text(60, "Elige el proveedor"),
  reference: optText(60),
  amount: positiveMoney,
  paymentMethod: immediatePaymentMethod.default("CASH"),
});

export const giftCardSchema = z.object({
  amount: positiveMoney,
  paymentMethod: immediatePaymentMethod.default("CASH"),
  customerName: optText(100),
  expiresAt: z.coerce.date().nullish(),
});

export const variantsSchema = z.object({
  baseLabel: text(60, "Escribe la variante de este producto"),
  labels: z.array(z.string().trim().max(60)).min(1, "Escribe al menos una variante").max(30),
});

export const openOrderSchema = z.object({
  label: text(60, "Escribe el nombre de la cuenta (p. ej. Mesa 3)"),
  notes: optText(300),
  items: z
    .array(
      z.object({
        id: id.nullish(),
        productId: id,
        quantity: positiveQty,
        modifierIds: z.array(z.string().max(40)).max(20).optional(),
        notes: optText(200),
      })
    )
    .max(200),
});

export const kitchenStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "READY", "SERVED"]),
});
