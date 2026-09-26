import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

/** Datos de cobro con Yappy que el punto de venta muestra al cliente. */
export const GET = handler(async () => {
  const auth = await requireAuth();
  return { directory: auth.business.yappyDirectory, qr: auth.business.yappyQr };
});
