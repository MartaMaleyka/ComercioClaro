import { z } from "zod";
import { handler, parseQuery } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { findGiftCard, maskCode } from "@/server/gift-cards";

/** Saldo de un vale por su código (limitado para impedir adivinar códigos). */
export const GET = handler(async (request) => {
  const auth = await requireAuth();
  await rateLimit(`gift-lookup:${auth.userId}`, 60, 600);
  const { code } = parseQuery(request, z.object({ code: z.string().trim().min(4).max(40) }));
  const card = await findGiftCard(auth.businessId, code);
  return {
    id: card.id,
    code: maskCode(card.code),
    balance: card.balance,
    status: card.status,
    expiresAt: card.expiresAt,
    customerName: card.customerName,
  };
});
