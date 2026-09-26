import { describe, expect, it } from "vitest";
import { loginSchema, productCreateSchema, registerSchema, saleSchema } from "@/lib/validation";
import { whatsappLink } from "@/lib/client/receipt";

describe("validación de entradas", () => {
  it("normaliza el correo", () => {
    expect(loginSchema.parse({ email: "  Demo@Correo.COM ", password: "x" }).email).toBe("demo@correo.com");
  });

  it("exige contraseñas de 8 caracteres", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "1234567", name: "A", businessName: "B" }).success).toBe(false);
  });

  it("rechaza cantidades negativas o cero en ventas", () => {
    for (const quantity of [-1, 0, "abc"]) {
      expect(saleSchema.safeParse({ items: [{ productId: "p", quantity }] }).success).toBe(false);
    }
  });

  it("rechaza precios negativos", () => {
    expect(productCreateSchema.safeParse({ name: "X", price: -5 }).success).toBe(false);
  });

  it("acepta números en texto y aplica valores por defecto", () => {
    const p = productCreateSchema.parse({ name: " Pan ", price: "12.5" });
    expect(p).toMatchObject({ name: "Pan", price: 12.5, unit: "PIECE", minStock: 5 });
    // Sin tasa explícita se usa la del país del negocio al crear el producto.
    expect(p.taxRate).toBeUndefined();
  });
});

describe("WhatsApp", () => {
  it("agrega la lada del país a números locales", () => {
    expect(whatsappLink("hola", "55 1234 5678", "es-MX")).toBe("https://wa.me/525512345678?text=hola");
    expect(whatsappLink("hola", "8888 1234", "es-NI")).toBe("https://wa.me/50588881234?text=hola");
    expect(whatsappLink("hola", "+52 55 1234 5678", "es-MX")).toBe("https://wa.me/525512345678?text=hola");
  });
});
