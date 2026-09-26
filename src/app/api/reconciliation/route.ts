import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { reconcileStatement } from "@/server/reconciliation";

const schema = z.object({
  csv: z.string().min(1, "Sube el estado de cuenta").max(2_000_000, "El archivo es demasiado grande (máx. 2 MB)"),
  method: z.enum(["YAPPY", "TRANSFER", "CARD", "ALL"]).default("YAPPY"),
});

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const input = await parseBody(request, schema);
  return reconcileStatement(auth.business, input);
});
