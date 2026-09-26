import { AppError, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Actor } from "../inventory";
import { buildPanamaDocument } from "./document";
import { getPacProvider, PacUnavailableError, PAC_PROVIDERS } from "./providers";

/** Reintentos por contingencia: 1, 5, 15, 30 y luego cada 60 minutos. */
const BACKOFF_MINUTES = [1, 5, 15, 30, 60];

function nextAttempt(attempts: number) {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000);
}

async function pacFor(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  if (business.country !== "PA" || business.einvoiceMode !== "PAC") {
    throw new AppError(409, "Activa la facturación automática con PAC en Configuración");
  }
  const provider = getPacProvider(business.einvoiceProvider);
  if (!provider) throw new AppError(409, "Elige el PAC en Configuración");
  if (!provider.isConfigured()) {
    throw new AppError(503, `El PAC ${provider.name} no está configurado en el servidor`);
  }
  return { business, provider };
}

/**
 * Emite la factura electrónica de una venta con el PAC configurado. Si el PAC no
 * responde, la factura queda pendiente (contingencia) y se reintenta sola.
 */
export async function issueSaleInvoice(actor: Actor, saleId: string, options: { customerId?: string | null } = {}) {
  const { provider } = await pacFor(actor.businessId);

  const invoice = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({ where: { id: saleId, businessId: actor.businessId } });
    if (!sale) throw notFound("Venta");
    if (sale.status !== "ACTIVE") throw new AppError(409, "No se puede facturar una venta cancelada");
    if (sale.invoiceId) throw new AppError(409, "La venta ya tiene factura");

    const customerId = options.customerId ?? sale.customerId;
    if (customerId) {
      const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: actor.businessId } });
      if (!customer) throw notFound("Cliente");
    }
    const created = await tx.invoice.create({
      data: {
        kind: "INDIVIDUAL",
        status: "PENDING",
        provider: provider.id,
        total: sale.total,
        customerId: customerId ?? null,
        businessId: actor.businessId,
      },
    });
    // La venta queda reservada para que no se facture dos veces.
    await tx.sale.update({ where: { id: sale.id }, data: { invoiceId: created.id } });
    await audit(tx, actor, "invoice.issue", "Invoice", created.id, { folio: sale.folio, provider: provider.id });
    return created;
  });

  return attemptInvoice(invoice.id);
}

/** Intenta (o reintenta) enviar una factura pendiente al PAC. */
export async function attemptInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      business: true,
      customer: true,
      sales: { include: { items: { include: { product: true } } } },
    },
  });
  if (invoice.status !== "PENDING") return invoice;
  const provider = getPacProvider(invoice.provider);
  if (!provider) throw new AppError(409, "PAC desconocido");
  const sale = invoice.sales[0];

  try {
    const result = invoice.providerId
      ? await provider.status(invoice.providerId)
      : await provider.issue(
          buildPanamaDocument(
            sale,
            invoice.business,
            invoice.customer
              ? { ...invoice.customer, address: null }
              : null
          ),
          invoice.id
        );

    if (result.status === "AUTHORIZED") {
      return prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "STAMPED",
          uuid: result.cufe ?? invoice.uuid,
          providerId: result.providerId ?? invoice.providerId,
          qrUrl: result.qrUrl ?? null,
          pdfUrl: result.pdfUrl ?? null,
          xmlUrl: result.xmlUrl ?? null,
          error: null,
          attempts: { increment: 1 },
          nextAttemptAt: null,
        },
      });
    }
    if (result.status === "PENDING") {
      return prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          providerId: result.providerId ?? invoice.providerId,
          attempts: { increment: 1 },
          nextAttemptAt: nextAttempt(invoice.attempts),
          error: "En validación por la DGI",
        },
      });
    }
    return reject(invoice.id, result.message ?? "Rechazada por el PAC/DGI");
  } catch (err) {
    if (err instanceof PacUnavailableError) {
      return prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: nextAttempt(invoice.attempts),
          error: `Contingencia: ${err.message}. Se reintentará automáticamente.`,
        },
      });
    }
    return reject(invoice.id, err instanceof Error ? err.message : "Error al emitir");
  }
}

/** Rechazo definitivo: se libera la venta para corregir datos y volver a emitir. */
async function reject(invoiceId: string, message: string) {
  return prisma.$transaction(async (tx) => {
    await tx.sale.updateMany({ where: { invoiceId }, data: { invoiceId: null } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "ERROR", error: message.slice(0, 1000), nextAttemptAt: null, attempts: { increment: 1 } },
    });
  });
}

/** Reintenta las facturas pendientes (cron o botón "Reintentar"). */
export async function retryPendingInvoices(businessId?: string, force = false) {
  const pending = await prisma.invoice.findMany({
    where: {
      status: "PENDING",
      provider: { in: Object.keys(PAC_PROVIDERS) },
      ...(businessId && { businessId }),
      ...(!force && { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }),
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const results = { processed: 0, stamped: 0, pending: 0, errors: 0 };
  for (const inv of pending) {
    const updated = await attemptInvoice(inv.id);
    results.processed++;
    if (updated.status === "STAMPED") results.stamped++;
    else if (updated.status === "PENDING") results.pending++;
    else results.errors++;
  }
  return results;
}

/** Emite en segundo plano la factura de una venta si el negocio tiene facturación automática. */
export async function autoInvoiceSale(actor: Actor, saleId: string) {
  const business = await prisma.business.findUnique({
    where: { id: actor.businessId },
    select: { country: true, einvoiceMode: true, autoInvoice: true, einvoiceProvider: true },
  });
  if (!business || business.country !== "PA" || business.einvoiceMode !== "PAC" || !business.autoInvoice) return;
  const provider = getPacProvider(business.einvoiceProvider);
  if (!provider?.isConfigured()) return;
  try {
    await issueSaleInvoice(actor, saleId);
  } catch (err) {
    console.error("[einvoice] No se pudo emitir automáticamente", err);
  }
}
