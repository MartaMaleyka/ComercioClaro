import { handler } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/server/account";

export const POST = handler(async () => {
  const auth = await requireSession();
  await rateLimit(`verify-email:resend:${auth.userId}`, 3, 60 * 60);
  return sendVerificationEmail(auth.userId);
});
