// Tipos de las respuestas de la API (Decimal ya convertido a number y fechas a ISO).

export type Unit = "PIECE" | "KG" | "G" | "L" | "ML" | "M";
export type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "CREDIT" | "YAPPY" | "GIFT_CARD";

export interface Category {
  id: string;
  name: string;
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  unit: Unit;
  price: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
  cost?: number;
  stock: number;
  minStock: number;
  trackExpiry: boolean;
  packSize: number | null;
  taxRate: number;
  iepsRate: number;
  satProductKey: string;
  satUnitKey: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  archivedAt: string | null;
  variantGroup?: string | null;
  variantLabel?: string | null;
  modifiers?: { id: string; name: string; price: number }[] | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  creditLimit: number;
  creditDays: number;
  points?: number;
  balance: number;
  rfc: string | null;
  legalName: string | null;
  taxRegime: string | null;
  postalCode: string | null;
  ruc: string | null;
  dv: string | null;
  /** Saldo vencido (antigüedad FIFO) */
  overdue?: number;
  daysOverdue?: number;
  nextDueDate?: string | null;
}

export interface SaleItem {
  id: string;
  productId: string;
  product: { id: string; name: string; unit: Unit; barcode: string | null };
  quantity: number;
  returnedQuantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  unitCost?: number;
  modifiers?: { id: string; name: string; price: number }[] | null;
}

export interface Sale {
  id: string;
  folio: number;
  status: "ACTIVE" | "CANCELLED";
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  costTotal?: number;
  amountReceived: number | null;
  change: number | null;
  paymentReference: string | null;
  dueDate: string | null;
  pointsEarned?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  items: SaleItem[];
  returns: { id: string; total: number; createdAt: string; reason: string | null; refundMethod: PaymentMethod }[];
  invoice: {
    id: string;
    status: string;
    uuid: string | null;
    kind: string;
    error?: string | null;
    provider?: string;
    qrUrl?: string | null;
  } | null;
  receiptText?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  _count?: { purchases: number };
}

export interface Purchase {
  id: string;
  folio: number;
  status: "ACTIVE" | "CANCELLED";
  total: number;
  supplierName: string | null;
  supplier: { id: string; name: string } | null;
  notes: string | null;
  paidFromCash: boolean;
  createdAt: string;
  cancelReason: string | null;
  items: {
    id: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
    lotCode: string | null;
    expiresAt: string | null;
    product: { id: string; name: string; unit: Unit };
  }[];
}

export interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  date: string;
}

export interface CashSession {
  id: string;
  openingAmount: number;
  expectedAmount: number | null;
  countedAmount: number | null;
  difference: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
}
