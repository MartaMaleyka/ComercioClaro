import { handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { businessSchema } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { syncDeliveryZones } from "@/server/delivery";

export const GET = handler(async () => {
  const auth = await requireAuth();
  return auth.business;
});

export const PUT = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { userName, deliveryZones, ...data } = await parseBody(request, businessSchema);
  // Solo se pueden encender las funciones que incluye el plan (apagarlas siempre se puede).
  const current = auth.business;
  if ((data.catalogEnabled && !current.catalogEnabled) || deliveryZones?.length) requireFeature(auth, "catalog");
  if (data.loyaltyEnabled && !current.loyaltyEnabled) requireFeature(auth, "loyalty");
  if (data.restaurantMode && !current.restaurantMode) requireFeature(auth, "restaurant");
  if (data.einvoiceMode === "PAC" && current.einvoiceMode !== "PAC") requireFeature(auth, "einvoice");
  if (data.yappyMode === "API" && current.yappyMode !== "API") requireFeature(auth, "yappyApi");
  if (data.catalogEnabled && !(data.catalogSlug ?? auth.business.catalogSlug)) {
    throw new AppError(400, "Elige la dirección del catálogo");
  }

  return prisma.$transaction(async (tx) => {
    const zones = deliveryZones ? await syncDeliveryZones(tx, auth.businessId, deliveryZones) : undefined;
    const business = await tx.business.update({
      where: { id: auth.businessId },
      data: { ...data, ...(zones ? { deliveryZones: zones as unknown as Prisma.InputJsonValue } : {}) },
    });
    const user = userName
      ? await tx.user.update({ where: { id: auth.userId }, data: { name: userName } })
      : null;
    await audit(tx, auth, "business.update", "Business", auth.businessId, {
      fields: [...Object.keys(data), ...(zones ? ["deliveryZones"] : [])],
    });
    return {
      business,
      user: user ? { id: user.id, email: user.email, name: user.name } : auth.user,
    };
  });
});
