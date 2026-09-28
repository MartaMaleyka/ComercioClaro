/**
 * Acciones en lote del inventario: cambiar el precio, la categoría o el stock mínimo de varios
 * productos a la vez, o archivarlos. El cálculo del precio se usa igual en la vista previa del
 * navegador y en el servidor.
 */
import { z } from "zod";

export const BATCH_MAX_PRODUCTS = 500;

export const PRICE_MODES = ["set", "percent", "amount"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

const number = z.coerce.number({ error: "Debe ser un número" }).refine(Number.isFinite, "Debe ser un número");
const id = z.string().min(1).max(64);

export const productBatchSchema = z.object({
  ids: z
    .array(id)
    .min(1, "Elige al menos un producto")
    .max(BATCH_MAX_PRODUCTS, `Máximo ${BATCH_MAX_PRODUCTS} productos por cambio`),
  action: z.discriminatedUnion("type", [
    z
      .object({ type: z.literal("price"), mode: z.enum(PRICE_MODES), value: number })
      .superRefine((a, ctx) => {
        const bad = (message: string) => ctx.addIssue({ code: "custom", path: ["value"], message });
        if (a.mode === "set" && (a.value < 0 || a.value > 99_999_999)) bad("El precio no puede ser negativo");
        if (a.mode === "percent" && (a.value <= -100 || a.value > 1000)) bad("El porcentaje debe estar entre -99% y 1000%");
        if (a.mode === "percent" && a.value === 0) bad("El porcentaje no puede ser 0");
        if (a.mode === "amount" && a.value === 0) bad("El monto no puede ser 0");
        if (a.mode === "amount" && Math.abs(a.value) > 99_999_999) bad("Monto demasiado grande");
      }),
    z.object({ type: z.literal("category"), categoryId: id.nullable() }),
    z.object({
      type: z.literal("minStock"),
      value: number.min(0, "No puede ser negativo").max(1_000_000, "Cantidad demasiado grande"),
    }),
    z.object({ type: z.literal("archive") }),
    z.object({ type: z.literal("restore") }),
  ]),
});

export type ProductBatchInput = z.infer<typeof productBatchSchema>;
export type ProductBatchAction = ProductBatchInput["action"];

/** Precio nuevo redondeado a centavos (medio hacia arriba). */
export function batchPrice(current: number, mode: PriceMode, value: number) {
  const next = mode === "set" ? value : mode === "percent" ? current * (1 + value / 100) : current + value;
  return Math.round((next + Number.EPSILON) * 100) / 100;
}
