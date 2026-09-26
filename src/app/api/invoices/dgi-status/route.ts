import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dgiFreeInvoicerStatus } from "@/server/dgi";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return dgiFreeInvoicerStatus(auth.business);
});
