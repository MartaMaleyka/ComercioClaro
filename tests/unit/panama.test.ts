import { describe, expect, it } from "vitest";
import { computeAging } from "@/lib/aging";
import { countryConfig, includedTax } from "@/lib/country";
import { formatCurrency } from "@/lib/utils";
import { messageKeys, translate, translations } from "@/lib/i18n";
import { businessSchema, customerSchema, saleSchema } from "@/lib/validation";

const day = 86_400_000;

describe("configuración de Panamá", () => {
  it("usa ITBMS 7/10/15 y exento, dólar mostrado como B/.", () => {
    const pa = countryConfig("PA");
    expect(pa.taxRates.map((r) => r.value).sort()).toEqual([0, 0.07, 0.1, 0.15]);
    expect(pa.defaultTaxRate).toBe(0.07);
    expect(pa.currency).toBe("USD");
    expect(pa.timezone).toBe("America/Panama");
    expect(pa.paymentMethods).toContain("YAPPY");
    expect(countryConfig("MX").paymentMethods).not.toContain("YAPPY");
  });

  it("muestra montos en balboas", () => {
    // Intl separa el símbolo con un espacio no separable.
    expect(formatCurrency(1234.5, "USD", "es-PA", true)).toMatch(/^B\/\.\s1,234\.50$/);
    expect(formatCurrency(10, "USD", "es-PA", false)).toMatch(/^USD\s10\.00$/);
  });

  it("calcula el ITBMS incluido en el precio", () => {
    expect(includedTax(1.07, 0.07)).toBe(0.07);
    expect(includedTax(11, 0.1)).toBe(1);
    expect(includedTax(5, 0)).toBe(0);
  });

  it("valida RUC y DV", () => {
    expect(businessSchema.parse({ ruc: "8-812-2345", dv: "45" })).toMatchObject({ ruc: "8-812-2345", dv: "45" });
    expect(businessSchema.parse({ ruc: "155678901-2-2021", dv: "7" }).ruc).toBe("155678901-2-2021");
    expect(businessSchema.safeParse({ ruc: "8 812 2345" }).success).toBe(false);
    expect(businessSchema.safeParse({ dv: "123" }).success).toBe(false);
  });

  it("acepta Yappy con número de operación y días de crédito", () => {
    const sale = saleSchema.parse({ items: [{ productId: "p", quantity: 1 }], paymentMethod: "YAPPY", paymentReference: " 123456 " });
    expect(sale.paymentReference).toBe("123456");
    expect(customerSchema.parse({ name: "Maritza" }).creditDays).toBe(15);
  });

  it("rechaza QR que no sea imagen", () => {
    expect(businessSchema.safeParse({ yappyQr: "javascript:alert(1)" }).success).toBe(false);
    expect(businessSchema.parse({ yappyQr: "data:image/png;base64,iVBORw0KGgo=" }).yappyQr).toMatch(/^data:image\/png/);
  });
});

describe("antigüedad del fiado (FIFO)", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const charge = (id: string, daysAgo: number, amount: number, credit = 15) => ({
    id,
    folio: Number(id),
    date: new Date(now.getTime() - daysAgo * day),
    dueDate: new Date(now.getTime() - (daysAgo - credit) * day),
    amount,
  });

  it("aplica los abonos a la venta más antigua", () => {
    const r = computeAging([charge("2", 10, 30), charge("1", 20, 50)], 40, now);
    expect(r.balance).toBe(40);
    expect(r.overdue).toBe(10); // quedan 10 de la venta de hace 20 días (venció hace 5)
    expect(r.daysOverdue).toBe(5);
    expect(r.charges.find((c) => c.id === "2")?.pending).toBe(30);
    expect(r.nextDueDate?.toISOString()).toBe(new Date(now.getTime() + 5 * day).toISOString());
  });

  it("sin atraso cuando los abonos cubren lo vencido", () => {
    const r = computeAging([charge("1", 20, 50), charge("2", 3, 20)], 50, now);
    expect(r.overdue).toBe(0);
    expect(r.balance).toBe(20);
  });
});

describe("traducciones", () => {
  it("chino e inglés solo usan claves existentes en español", () => {
    for (const dict of [translations.zh, translations.en]) {
      for (const key of Object.keys(dict)) expect(messageKeys).toContain(key);
    }
  });

  it("cubre en chino todo el menú, el punto de venta y la caja", () => {
    const missing = messageKeys.filter((k) => !(k in translations.zh));
    expect(missing).toEqual([]);
  });

  it("reemplaza parámetros y cae a español", () => {
    expect(translate("zh", "pos.yappyCharge", { amount: "B/. 2.00" })).toBe("通过 Yappy 收款 B/. 2.00");
    expect(translate("en", "pay.YAPPY")).toBe("Yappy");
    expect(translate("xx", "nav.sell")).toBe("Vender");
  });
});
