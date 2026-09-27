import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dismissOnboarding } from "@/server/onboarding";

export const POST = handler(async () => {
  const auth = await requireAuth("OWNER");
  return dismissOnboarding(auth.businessId);
});
