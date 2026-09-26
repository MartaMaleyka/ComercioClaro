import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { recordCount, removeCountLine } from "@/server/counts";

const schema = z
  .object({
    productId: z.string().max(64).nullish(),
    barcode: z.string().trim().max(64).nullish(),
    quantity: z.coerce.number().min(0).max(1_000_000),
    mode: z.enum(["add", "set"]).default("add"),
  })
  .refine((v) => v.productId || v.barcode, { message: "Indica el producto o su código" });

export const POST = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  return recordCount(auth, id, await parseBody(request, schema));
});

export const DELETE = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const productId = request.nextUrl.searchParams.get("productId") ?? "";
  await removeCountLine(auth, id, productId);
  return { success: true };
});
