import { describe, expect, it } from "vitest";
import { buildItem } from "@/lib/cfdi";

describe("conceptos CFDI", () => {
  it("desglosa IVA de un precio con impuestos incluidos", () => {
    const item = buildItem({ totalWithTax: 116, quantity: 2, taxRate: 0.16, iepsRate: 0, productCode: "01010101", unitCode: "H87", description: "X" });
    expect(item.Subtotal).toBe(100);
    expect(item.UnitPrice).toBe(50);
    expect(item.Taxes).toEqual([{ Name: "IVA", Rate: 0.16, Base: 100, Total: 16, IsRetention: false }]);
    expect(item.Total).toBe(116);
  });

  it("incluye el IEPS en la base del IVA y cuadra el total", () => {
    const item = buildItem({ totalWithTax: 18, quantity: 1, taxRate: 0.16, iepsRate: 0.08, productCode: "50202306", unitCode: "H87", description: "Refresco" });
    const taxes = item.Taxes.reduce((a, t) => a + t.Total, 0);
    expect(Math.round((item.Subtotal + taxes) * 100) / 100).toBe(18);
    const ieps = item.Taxes.find((t) => t.Name === "IEPS")!;
    const iva = item.Taxes.find((t) => t.Name === "IVA")!;
    expect(iva.Base).toBeCloseTo(item.Subtotal + ieps.Total, 2);
  });

  it("maneja tasa 0 (alimentos)", () => {
    const item = buildItem({ totalWithTax: 38.5, quantity: 1.25, taxRate: 0, iepsRate: 0, productCode: "01010101", unitCode: "KGM", description: "Frijol" });
    expect(item.Subtotal).toBe(38.5);
    expect(item.Taxes[0].Total).toBe(0);
    expect(item.Unit).toBe("Kilogramo");
  });
});
