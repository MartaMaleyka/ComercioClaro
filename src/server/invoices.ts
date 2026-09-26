import { AppError, notFound } from "@/lib/errors";
import { D, money, sum } from "@/lib/decimal";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayRange, parseDayKey } from "@/lib/dates";
import { buildItem, PAYMENT_FORM, PUBLIC_RFC, type CfdiItem } from "@/lib/cfdi";
import type { Actor } from "./inventory";

const PROVIDER = "facturama";

function facturamaConfig() {
  const user = process.env.FACTURAMA_USER;
  const password = process.env.FACTURAMA_PASSWORD;
  if (!user || !password) {
    throw new AppError(
      503,
      "La facturación electrónica no está configurada. Agrega FACTURAMA_USER y FACTURAMA_PASSWORD."
    );
  }
  const sandbox = process.env.FACTURAMA_SANDBOX !== "false";
  return {
    baseUrl: sandbox ? "https://apisandbox.facturama.mx" : "https://api.facturama.mx",
    auth: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
  };
}

async function facturamaRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl, auth } = facturamaConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      body?.ModelState
        ? Object.values(body.ModelState as Record<string, string[]>).flat().join(" ")
        : body?.Message || `Error ${res.status}`;
    throw new AppError(502, `El PAC rechazó la solicitud: ${detail}`);
  }
  return body as T;
}

function assertIssuer(business: { rfc: string | null; legalName: string | null; taxRegime: string | null; postalCode: string | null }) {
  if (!business.rfc || !business.legalName || !business.taxRegime || !business.postalCode) {
    throw new AppError(400, "Completa los datos fiscales del negocio (RFC, razón social, régimen y C.P.) en Configuración");
  }
  return business as { rfc: string; legalName: string; taxRegime: string; postalCode: string };
}

interface FacturamaCfdi {
  Id: string;
  Complement?: { TaxStamp?: { Uuid?: string } };
}

/** Factura individual de una venta a un cliente con datos fiscales. */
export async function invoiceSale(
  actor: Actor,
  input: { saleId: string; customerId: string; cfdiUse: string; paymentForm?: string }
) {
  const [business, sale, customer] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } }),
    prisma.sale.findFirst({
      where: { id: input.saleId, businessId: actor.businessId },
      include: { items: { include: { product: true } } },
    }),
    prisma.customer.findFirst({ where: { id: input.customerId, businessId: actor.businessId } }),
  ]);
  const issuer = assertIssuer(business);
  if (!sale) throw notFound("Venta");
  if (!customer) throw notFound("Cliente");
  if (sale.status !== "ACTIVE") throw new AppError(409, "No se puede facturar una venta cancelada");
  if (sale.invoiceId) throw new AppError(409, "La venta ya está facturada");
  if (!customer.rfc || !customer.legalName || !customer.taxRegime || !customer.postalCode) {
    throw new AppError(400, "El cliente necesita RFC, razón social, régimen fiscal y código postal");
  }

  const factor = D(sale.subtotal).gt(0) ? D(sale.total).div(sale.subtotal) : D(0);
  const items: CfdiItem[] = sale.items
    .map((item) => {
      const remaining = D(item.quantity).minus(item.returnedQuantity);
      if (remaining.lte(0)) return null;
      return buildItem({
        totalWithTax: D(item.subtotal).div(item.quantity).times(remaining).times(factor),
        quantity: remaining,
        taxRate: item.taxRate,
        iepsRate: item.iepsRate,
        productCode: item.product.satProductKey,
        unitCode: item.product.satUnitKey,
        description: item.product.name,
        identification: item.product.sku ?? item.product.barcode ?? undefined,
      });
    })
    .filter((i): i is CfdiItem => i !== null);
  if (items.length === 0) throw new AppError(409, "La venta no tiene importes por facturar");

  const payload = {
    NameId: "1",
    CfdiType: "I",
    Currency: business.currency,
    ExpeditionPlace: issuer.postalCode,
    Folio: String(sale.folio),
    PaymentForm: input.paymentForm ?? PAYMENT_FORM[sale.paymentMethod],
    PaymentMethod: sale.paymentMethod === "CREDIT" ? "PPD" : "PUE",
    Exportation: "01",
    Receiver: {
      Rfc: customer.rfc,
      Name: customer.legalName,
      CfdiUse: input.cfdiUse,
      FiscalRegime: customer.taxRegime,
      TaxZipCode: customer.postalCode,
    },
    Items: items,
  };

  return stamp(actor, {
    kind: "INDIVIDUAL",
    payload,
    total: money(sum(items.map((i) => i.Total))),
    customerId: customer.id,
    saleIds: [sale.id],
  });
}

/** Factura global al público en general de las ventas no facturadas del periodo. */
export async function invoiceGlobal(actor: Actor, input: { from: string; to: string; periodicity: string }) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
  const issuer = assertIssuer(business);
  const range = dayRange(input.from, input.to, business.timezone);

  const sales = await prisma.sale.findMany({
    where: {
      businessId: actor.businessId,
      status: "ACTIVE",
      invoiceId: null,
      createdAt: { gte: range.start, lt: range.end },
    },
    include: { items: true },
    orderBy: { folio: "asc" },
  });
  if (sales.length === 0) throw new AppError(409, "No hay ventas sin facturar en el periodo");

  // Un concepto por ticket y tasa de impuestos, como pide la guía de llenado del CFDI global.
  const items: CfdiItem[] = [];
  for (const sale of sales) {
    const factor = D(sale.subtotal).gt(0) ? D(sale.total).div(sale.subtotal) : D(0);
    const groups = new Map<string, { taxRate: string; iepsRate: string; amount: ReturnType<typeof D> }>();
    for (const item of sale.items) {
      const remaining = D(item.quantity).minus(item.returnedQuantity);
      if (remaining.lte(0)) continue;
      const amount = D(item.subtotal).div(item.quantity).times(remaining).times(factor);
      const key = `${item.taxRate}|${item.iepsRate}`;
      const g = groups.get(key);
      if (g) g.amount = g.amount.plus(amount);
      else groups.set(key, { taxRate: item.taxRate.toString(), iepsRate: item.iepsRate.toString(), amount });
    }
    for (const g of groups.values()) {
      if (money(g.amount).lte(0)) continue;
      items.push(
        buildItem({
          totalWithTax: g.amount,
          quantity: 1,
          taxRate: g.taxRate,
          iepsRate: g.iepsRate,
          productCode: "01010101",
          unitCode: "ACT",
          description: "Venta",
          identification: String(sale.folio),
        })
      );
    }
  }
  if (items.length === 0) throw new AppError(409, "No hay importes por facturar en el periodo");

  const { year, month } = parseDayKey(input.from);
  const months = input.periodicity === "05" ? String(12 + Math.ceil(month / 2)) : String(month).padStart(2, "0");

  const payload = {
    NameId: "1",
    CfdiType: "I",
    Currency: business.currency,
    ExpeditionPlace: issuer.postalCode,
    PaymentForm: "01",
    PaymentMethod: "PUE",
    Exportation: "01",
    GlobalInformation: { Periodicity: input.periodicity, Months: months, Year: String(year) },
    Receiver: {
      Rfc: PUBLIC_RFC,
      Name: "PUBLICO EN GENERAL",
      CfdiUse: "S01",
      FiscalRegime: "616",
      TaxZipCode: issuer.postalCode,
    },
    Items: items,
  };

  return stamp(actor, {
    kind: "GLOBAL",
    payload,
    total: money(sum(items.map((i) => i.Total))),
    saleIds: sales.map((s) => s.id),
    periodicity: input.periodicity,
    periodStart: range.start,
    periodEnd: range.end,
  });
}

async function stamp(
  actor: Actor,
  data: {
    kind: "INDIVIDUAL" | "GLOBAL";
    payload: unknown;
    total: ReturnType<typeof D>;
    saleIds: string[];
    customerId?: string;
    periodicity?: string;
    periodStart?: Date;
    periodEnd?: Date;
  }
) {
  facturamaConfig();
  const invoice = await prisma.invoice.create({
    data: {
      kind: data.kind,
      provider: PROVIDER,
      total: data.total,
      customerId: data.customerId ?? null,
      periodicity: data.periodicity ?? null,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
      businessId: actor.businessId,
    },
  });

  try {
    const result = await facturamaRequest<FacturamaCfdi>("/3/cfdis", {
      method: "POST",
      body: JSON.stringify(data.payload),
    });
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.sale.updateMany({
        where: { id: { in: data.saleIds }, invoiceId: null },
        data: { invoiceId: invoice.id },
      });
      if (count !== data.saleIds.length) {
        console.warn(`[cfdi] ${data.saleIds.length - count} ventas ya estaban facturadas`);
      }
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: "STAMPED", providerId: result.Id, uuid: result.Complement?.TaxStamp?.Uuid ?? null },
      });
      await audit(tx, actor, "invoice.stamp", "Invoice", invoice.id, { kind: data.kind, sales: data.saleIds.length });
      return updated;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "ERROR", error: message.slice(0, 1000) } });
    throw err instanceof AppError ? err : new AppError(502, "No se pudo timbrar la factura");
  }
}

export async function downloadInvoice(businessId: string, id: string, format: "pdf" | "xml") {
  const invoice = await prisma.invoice.findFirst({ where: { id, businessId } });
  if (!invoice?.providerId) throw notFound("Factura");
  const file = await facturamaRequest<{ Content: string }>(`/cfdi/${format}/issued/${invoice.providerId}`);
  return { invoice, content: Buffer.from(file.Content, "base64") };
}

/** Cancela la factura ante el SAT (motivo 02: comprobante con errores sin relación). */
export async function cancelInvoice(actor: Actor, id: string, motive = "02") {
  const invoice = await prisma.invoice.findFirst({ where: { id, businessId: actor.businessId } });
  if (!invoice) throw notFound("Factura");
  if (invoice.status !== "STAMPED" || !invoice.providerId) {
    throw new AppError(409, "Solo se pueden cancelar facturas timbradas");
  }
  await facturamaRequest(`/cfdi/${invoice.providerId}?type=issued&motive=${motive}`, { method: "DELETE" });
  return prisma.$transaction(async (tx) => {
    await tx.sale.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
    const updated = await tx.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "invoice.cancel", "Invoice", id, { motive });
    return updated;
  });
}
