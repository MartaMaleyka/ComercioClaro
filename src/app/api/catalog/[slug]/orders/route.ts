import { handler, parseBody, created, clientIp } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { onlineOrderSchema } from "@/lib/validation";
import { createOnlineOrder } from "@/server/online-orders";

/** Pedido desde el catálogo público (sin sesión; limitado por IP). */
export const POST = handler<{ slug: string }>(async (request, { params }) => {
  const { slug } = await params;
  await rateLimit(`catalog-order:${clientIp(request)}`, 10, 3600);
  const input = await parseBody(request, onlineOrderSchema);
  return created(await createOnlineOrder(slug, input));
});
