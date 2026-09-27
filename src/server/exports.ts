import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { dayRange } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS, UNIT_LABELS } from "@/lib/utils";
import type { listQuerySchema } from "@/lib/validation";

export const EXPORT_TYPES = ["products", "sales", "sale-items", "purchases", "expenses", "customers"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
type ListQuery = z.infer<typeof listQuerySchema>;

const MAX_ROWS = 50000;

export async function exportCsv(
  business: { id: string; timezone: string; locale: string },
  type: ExportType,
  query: ListQuery
) {
  const businessId = business.id;
  const range =
    query.from || query.to
      ? dayRange(query.from ?? "2000-01-01", query.to ?? "2999-12-31", business.timezone)
      : null;
  const createdAt = range ? { gte: range.start, lt: range.end } : undefined;
  const localDate = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: business.timezone, dateStyle: "short", timeStyle: "medium" }).format(d);

  switch (type) {
    case "products": {
      const products = await prisma.product.findMany({
        where: { businessId, archivedAt: null },
        include: { category: true },
        orderBy: { name: "asc" },
        take: MAX_ROWS,
      });
      return toCsv(
        ["Nombre", "Código de barras", "SKU", "Categoría", "Unidad", "Precio", "Precio mayoreo", "Mayoreo desde", "Costo", "Existencia", "Stock mínimo", "IVA", "IEPS", "Clave SAT", "Clave unidad SAT"],
        products.map((p) => [
          p.name, p.barcode, p.sku, p.category?.name, UNIT_LABELS[p.unit], p.price.toFixed(2),
          p.wholesalePrice?.toFixed(2), p.wholesaleMinQty?.toString(), p.cost.toFixed(4), p.stock.toString(),
          p.minStock.toString(), p.taxRate.toString(), p.iepsRate.toString(), p.satProductKey, p.satUnitKey,
        ])
      );
    }
    case "sales": {
      const sales = await prisma.sale.findMany({
        where: { businessId, createdAt },
        include: { customer: true, payments: true },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
      });
      // Pago dividido: "Mixto (Efectivo 5.00 + Tarjeta 10.00)".
      const methodLabel = (s: (typeof sales)[number]) =>
        s.paymentMethod === "MIXED"
          ? `${PAYMENT_METHOD_LABELS.MIXED} (${s.payments.map((p) => `${PAYMENT_METHOD_LABELS[p.method]} ${p.amount.toFixed(2)}`).join(" + ")})`
          : PAYMENT_METHOD_LABELS[s.paymentMethod];
      return toCsv(
        ["Folio", "Fecha", "Estado", "Forma de pago", "Referencia", "Vence", "Cliente", "Subtotal", "Descuento", "Total", "Costo", "Utilidad bruta", "Notas", "Motivo cancelación"],
        sales.map((s) => [
          s.folio, localDate(s.createdAt), s.status === "ACTIVE" ? "Activa" : "Cancelada",
          methodLabel(s), s.paymentReference, s.dueDate?.toISOString().slice(0, 10), s.customer?.name, s.subtotal.toFixed(2), s.discount.toFixed(2),
          s.total.toFixed(2), s.costTotal.toFixed(2), s.total.minus(s.costTotal).toFixed(2), s.notes, s.cancelReason,
        ])
      );
    }
    case "sale-items": {
      const items = await prisma.saleItem.findMany({
        where: { sale: { businessId, createdAt } },
        include: { sale: true, product: true },
        orderBy: { sale: { createdAt: "asc" } },
        take: MAX_ROWS,
      });
      return toCsv(
        ["Folio", "Fecha", "Estado", "Producto", "Cantidad", "Devuelto", "Precio unitario", "Descuento", "Subtotal", "Costo unitario"],
        items.map((i) => [
          i.sale.folio, localDate(i.sale.createdAt), i.sale.status === "ACTIVE" ? "Activa" : "Cancelada",
          i.product.name, i.quantity.toString(), i.returnedQuantity.toString(), i.unitPrice.toFixed(2),
          i.discount.toFixed(2), i.subtotal.toFixed(2), i.unitCost.toFixed(4),
        ])
      );
    }
    case "purchases": {
      const items = await prisma.purchaseItem.findMany({
        where: { purchase: { businessId, createdAt } },
        include: { purchase: { include: { supplier: true } }, product: true },
        orderBy: { purchase: { createdAt: "asc" } },
        take: MAX_ROWS,
      });
      return toCsv(
        ["Folio", "Fecha", "Estado", "Proveedor", "Producto", "Cantidad", "Costo unitario", "Subtotal", "Lote", "Caducidad"],
        items.map((i) => [
          i.purchase.folio, localDate(i.purchase.createdAt), i.purchase.status === "ACTIVE" ? "Activa" : "Cancelada",
          i.purchase.supplier?.name ?? i.purchase.supplierName, i.product.name, i.quantity.toString(),
          i.unitCost.toFixed(4), i.subtotal.toFixed(2), i.lotCode, i.expiresAt?.toISOString().slice(0, 10),
        ])
      );
    }
    case "expenses": {
      const expenses = await prisma.expense.findMany({
        where: { businessId, date: createdAt },
        orderBy: { date: "asc" },
        take: MAX_ROWS,
      });
      return toCsv(
        ["Fecha", "Categoría", "Descripción", "Forma de pago", "Monto"],
        expenses.map((e) => [localDate(e.date), e.category, e.description, PAYMENT_METHOD_LABELS[e.paymentMethod], e.amount.toFixed(2)])
      );
    }
    case "customers": {
      const customers = await prisma.customer.findMany({
        where: { businessId, archivedAt: null },
        orderBy: { name: "asc" },
        take: MAX_ROWS,
      });
      return toCsv(
        ["Nombre", "Teléfono", "Correo", "Límite de crédito", "Saldo", "RFC", "Razón social", "Régimen", "C.P."],
        customers.map((c) => [c.name, c.phone, c.email, c.creditLimit.toFixed(2), c.balance.toFixed(2), c.rfc, c.legalName, c.taxRegime, c.postalCode])
      );
    }
  }
}

/** Respaldo completo del negocio en JSON (sin contraseñas ni datos de otros negocios). */
export async function exportBackup(businessId: string) {
  const where = { businessId };
  const [business, categories, products, customers, customerPayments, suppliers, sales, saleReturns, purchases, batches, stockMovements, cashSessions, cashMovements, expenses, invoices] =
    await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      prisma.category.findMany({ where }),
      prisma.product.findMany({ where }),
      prisma.customer.findMany({ where }),
      prisma.customerPayment.findMany({ where }),
      prisma.supplier.findMany({ where }),
      prisma.sale.findMany({ where, include: { items: true } }),
      prisma.saleReturn.findMany({ where, include: { items: true } }),
      prisma.purchase.findMany({ where, include: { items: true } }),
      prisma.productBatch.findMany({ where }),
      prisma.stockMovement.findMany({ where }),
      prisma.cashSession.findMany({ where }),
      prisma.cashMovement.findMany({ where }),
      prisma.expense.findMany({ where }),
      prisma.invoice.findMany({ where }),
    ]);
  return {
    version: 1,
    exportedAt: new Date(),
    business,
    categories,
    products,
    customers,
    customerPayments,
    suppliers,
    sales,
    saleReturns,
    purchases,
    batches,
    stockMovements,
    cashSessions,
    cashMovements,
    expenses,
    invoices,
  };
}
