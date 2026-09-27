import { handler, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { platformSettingsSchema } from "@/lib/validation";
import { platformSettings, updatePlatformSettings } from "@/server/billing";
import { providerName } from "@/server/billing-providers";

export const GET = handler(async () => {
  await requireSuperAdmin();
  return { ...(await platformSettings()), provider: providerName() };
});

export const PUT = handler(async (request) => {
  const admin = await requireSuperAdmin();
  return updatePlatformSettings(admin, await parseBody(request, platformSettingsSchema));
});
