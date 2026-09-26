import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { currentCount, startCount } from "@/server/counts";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return (await currentCount(auth.businessId)) ?? null;
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const { notes } = await parseBody(request, z.object({ notes: z.string().max(300).nullish() }));
  return startCount(auth, notes ?? null);
});
