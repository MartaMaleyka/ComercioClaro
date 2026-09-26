import { describe, expect, it } from "vitest";
import { D, money, reverseWeightedAverageCost, serialize, weightedAverageCost } from "@/lib/decimal";

describe("dinero y costos", () => {
  it("redondea a centavos sin errores de punto flotante", () => {
    expect(money(D(0.1).plus(0.2)).toString()).toBe("0.3");
    expect(money("2.675").toString()).toBe("2.68");
  });

  it("calcula el costo promedio ponderado", () => {
    // 48 piezas a 12 + 24 piezas a 12.50 = 12.1667
    expect(weightedAverageCost(48, 12, 24, 12.5).toFixed(4)).toBe("12.1667");
  });

  it("ignora existencias negativas al promediar", () => {
    expect(weightedAverageCost(-5, 20, 10, 8).toFixed(2)).toBe("8.00");
  });

  it("revierte el promedio al cancelar una compra", () => {
    const avg = weightedAverageCost(48, 12, 24, 12.5);
    expect(reverseWeightedAverageCost(72, avg, 24, 12.5).toFixed(2)).toBe("12.00");
  });

  it("conserva el costo si revertir no tiene sentido", () => {
    expect(reverseWeightedAverageCost(5, 10, 5, 10).toFixed(2)).toBe("10.00");
  });

  it("serializa Decimal a número y fechas a ISO", () => {
    const out = serialize({ a: D("1.50"), b: [D(2)], c: new Date("2026-01-01T00:00:00Z"), d: null });
    expect(out).toEqual({ a: 1.5, b: [2], c: "2026-01-01T00:00:00.000Z", d: null });
  });
});
