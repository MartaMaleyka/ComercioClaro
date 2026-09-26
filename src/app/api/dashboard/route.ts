import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { dashboard } from "@/server/reports";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return dashboard(auth.business);
});
