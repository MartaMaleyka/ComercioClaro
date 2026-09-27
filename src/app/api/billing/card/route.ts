import { handler } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { removeCard } from "@/server/billing";

export const DELETE = handler(async () => {
  const auth = await requireSession("OWNER");
  return removeCard(auth);
});
