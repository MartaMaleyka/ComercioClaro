import { z } from "zod";
import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createYappyCharge } from "@/server/yappy";

const schema = z.object({
  amount: z.coerce.number().gt(0).max(100000),
  phone: z.string().trim().min(8).max(20),
});

/** Envía una solicitud de cobro Yappy al celular del cliente. */
export const POST = handler(async (request) => {
  const auth = await requireAuth();
  await rateLimit(`yappy:${auth.businessId}`, 60, 60);
  const input = await parseBody(request, schema);
  return created(await createYappyCharge(auth, input));
});
