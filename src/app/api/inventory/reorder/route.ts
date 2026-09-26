import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { reorderSuggestions } from "@/server/inventory";

export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return reorderSuggestions(auth.businessId);
});
