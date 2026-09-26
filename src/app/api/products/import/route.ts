import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { importProducts } from "@/server/catalog";

const MAX_BYTES = 2 * 1024 * 1024;

export const POST = handler(async (request) => {
  const auth = await requireAuth("OWNER");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(400, "Adjunta un archivo CSV");
  if (file.size > MAX_BYTES) throw new AppError(400, "El archivo es demasiado grande (máximo 2 MB)");
  return importProducts(auth, await file.text());
});
