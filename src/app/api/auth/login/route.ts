import { handler, parseBody, clientIp } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/server/account";

export const POST = handler(async (request) => {
  const input = await parseBody(request, loginSchema);
  await rateLimit(`login:ip:${clientIp(request)}`, 20, 15 * 60);
  await rateLimit(`login:email:${input.email}`, 8, 15 * 60);

  const { user, businessId } = await authenticate(input);
  await resetRateLimit(`login:email:${input.email}`);
  await startSession({ sub: user.id, bid: businessId, tv: user.tokenVersion });

  return {
    user: { id: user.id, email: user.email, name: user.name, mustChangePassword: user.mustChangePassword },
  };
});
