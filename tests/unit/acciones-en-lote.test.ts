import { describe, expect, it } from "vitest";
import { batchPrice, productBatchSchema } from "@/lib/product-batch";

describe("acciones en lote: precio", () => {
  it("pone, sube o baja un porcentaje, o suma un monto, redondeando a centavos", () => {
    expect(batchPrice(3.95, "set", 4.5)).toBe(4.5);
    expect(batchPrice(10, "percent", 10)).toBe(11);
    expect(batchPrice(3.95, "percent", 7)).toBe(4.23);
    expect(batchPrice(1.25, "percent", -10)).toBe(1.13);
    expect(batchPrice(2, "amount", -0.25)).toBe(1.75);
  });

  it("valida la acción", () => {
    const parse = (action: unknown, ids = ["a"]) => productBatchSchema.safeParse({ ids, action });
    expect(parse({ type: "price", mode: "percent", value: "10" }).success).toBe(true);
    expect(parse({ type: "price", mode: "percent", value: 0 }).success).toBe(false);
    expect(parse({ type: "price", mode: "percent", value: -100 }).success).toBe(false);
    expect(parse({ type: "price", mode: "set", value: -1 }).success).toBe(false);
    expect(parse({ type: "category", categoryId: null }).success).toBe(true);
    expect(parse({ type: "minStock", value: -1 }).success).toBe(false);
    expect(parse({ type: "archive" }, []).success).toBe(false);
    expect(parse({ type: "borrar" }).success).toBe(false);
  });
});
