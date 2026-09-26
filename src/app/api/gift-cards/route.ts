import { z } from "zod";
import { created, handler, parseBody, parseQuery } from "@/lib/api";
import { requireAuth, requireFeature } from "@/lib/auth";
import { giftCardSchema } from "@/lib/validation";
import { issueGiftCard, listGiftCards } from "@/server/gift-cards";

export const GET = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "giftCards");
  const { search } = parseQuery(request, z.object({ search: z.string().trim().max(60).optional() }));
  return listGiftCards(auth.businessId, search);
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  requireFeature(auth, "giftCards");
  return created(await issueGiftCard(auth, await parseBody(request, giftCardSchema)));
});
