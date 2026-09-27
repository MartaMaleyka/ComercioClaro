import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { onboardingSteps } from "@/server/onboarding";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return onboardingSteps(auth);
});
