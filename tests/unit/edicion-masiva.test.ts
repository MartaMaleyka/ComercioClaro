import { describe, expect, it } from "vitest";
import { adjustValue, cellNumber, marginPercent, roundPrice } from "@/lib/bulk-edit";

describe("edición masiva: ajustes de precio", () => {
  it("lee lo que se escribe en la celda", () => {
    expect(cellNumber("B/. 1,250.50")).toBe(1250.5);
    expect(cellNumber("$3")).toBe(3);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber("abc")).toBeNull();
  });

  it("sube, baja, suma, resta y fija sin dejar negativos", () => {
    expect(adjustValue(2, "up%", 10)).toBe(2.2);
    expect(adjustValue(2, "down%", 25)).toBe(1.5);
    expect(adjustValue(2, "add", 0.35)).toBe(2.35);
    expect(adjustValue(0.2, "sub", 0.5)).toBe(0);
    expect(adjustValue(9, "set", 4.5)).toBe(4.5);
  });

  it("redondea al múltiplo o para terminar en .99", () => {
    expect(roundPrice(1.23, "0.05")).toBe(1.25);
    expect(roundPrice(1.23, "0.25")).toBe(1.25);
    expect(roundPrice(1.62, "0.50")).toBe(1.5);
    expect(roundPrice(1.62, "1")).toBe(2);
    expect(roundPrice(3.4, "99")).toBe(3.99);
    expect(roundPrice(0.5, "99")).toBe(0.99);
    expect(adjustValue(3.1, "up%", 7, "0.10")).toBe(3.3);
  });

  it("calcula el margen sobre el precio", () => {
    expect(marginPercent(4, 3)).toBe(25);
    expect(marginPercent(2, 3)).toBe(-50);
    expect(marginPercent(0, 1)).toBeNull();
    expect(marginPercent(null, 1)).toBeNull();
  });
});
