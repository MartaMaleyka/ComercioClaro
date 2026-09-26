import { handler, parseBody, clientIp } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { registerAccount } from "@/server/account";

export const POST = handler(async (request) => {
  await rateLimit(`register:ip:${clientIp(request)}`, 5, 60 * 60);
  const input = await parseBody(request, registerSchema);
  const { user, businessId } = await registerAccount(input);
  await startSession({ sub: user.id, bid: businessId, tv: user.tokenVersion });
  return { user: { id: user.id, email: user.email, name: user.name } };
});
