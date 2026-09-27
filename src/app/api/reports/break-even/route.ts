import { handler } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { breakEven } from "@/server/cashflow";

/** Punto de equilibrio del mes: en monto y en días. */
export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  requireFeature(auth, "cashflow");
  return breakEven(auth.business);
});
