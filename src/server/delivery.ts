import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { D, money } from "@/lib/decimal";
import type { Tx } from "@/lib/prisma";
import { countryConfig } from "@/lib/country";
import type { deliveryZonesSchema } from "@/lib/validation";

export type DeliveryZoneInput = z.infer<typeof deliveryZonesSchema>[number];

export interface DeliveryZone {
  name: string;
  fee: number;
  /** Producto de servicio (sin existencias) con el que se cobra la entrega. */
  productId: string;
}

export function deliveryZones(business: { deliveryZones: unknown }): DeliveryZone[] {
  return Array.isArray(business.deliveryZones) ? (business.deliveryZones as DeliveryZone[]) : [];
}

export const deliveryProductName = (zone: string) => `Entrega · ${zone}`;

/**
 * Guarda las zonas de entrega. Cada zona es un producto de servicio "Entrega · <zona>" sin
 * existencias, así el cargo se cobra como un renglón más de la venta y aparece en los reportes.
 * Las zonas que se quitan archivan su producto.
 */
export async function syncDeliveryZones(tx: Tx, businessId: string, zones: DeliveryZoneInput[]) {
  const business = await tx.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { country: true, deliveryZones: true },
  });
  const seen = new Set<string>();
  for (const zone of zones) {
    const key = zone.name.toLowerCase();
    if (seen.has(key)) throw new AppError(400, `La zona ${zone.name} está repetida`);
    seen.add(key);
  }
  const taxRate = D(countryConfig(business.country).defaultTaxRate);
  const previous = deliveryZones(business);
  const result: DeliveryZone[] = [];
  for (const zone of zones) {
    const productId =
      zone.productId ?? previous.find((p) => p.name.toLowerCase() === zone.name.toLowerCase())?.productId;
    const data = {
      name: deliveryProductName(zone.name),
      price: money(zone.fee),
      archivedAt: null,
      trackStock: false,
      seniorEligible: false,
    };
    const existing = productId ? await tx.product.findFirst({ where: { id: productId, businessId } }) : null;
    const product = existing
      ? await tx.product.update({ where: { id: existing.id }, data })
      : await tx.product.create({
          data: {
            ...data,
            unit: "PIECE",
            cost: 0,
            stock: 0,
            minStock: 0,
            taxRate,
            satUnitKey: "E48",
            businessId,
          },
        });
    result.push({
      name: zone.name,
      fee: money(zone.fee).toNumber(),
      productId: product.id,
    });
  }
  const kept = new Set(result.map((z) => z.productId));
  const removed = previous.filter((p) => !kept.has(p.productId)).map((p) => p.productId);
  if (removed.length > 0) {
    await tx.product.updateMany({
      where: { id: { in: removed }, businessId },
      data: { archivedAt: new Date() },
    });
  }
  return result;
}
