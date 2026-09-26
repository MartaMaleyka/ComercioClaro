import { created, handler, parseBody } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { serviceSaleSchema } from "@/lib/validation";
import { createServiceSale, listTodayServiceSales, serviceProviders } from "@/server/services";

/** Proveedores configurados y recargas/pagos registrados hoy. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  requireFeature(auth, "services");
  return {
    providers: serviceProviders(auth.business),
    today: await listTodayServiceSales(auth.businessId, auth.business.timezone),
  };
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "services");
  return created(await createServiceSale(auth, await parseBody(request, serviceSaleSchema)));
});
