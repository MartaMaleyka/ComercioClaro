import { describe, expect, it } from "vitest";
import { parseAmount, parseBankDate, parseBankStatement, reconcile, type ReconcileSale } from "@/lib/reconcile";

describe("lectura del estado de cuenta", () => {
  it("entiende montos y fechas en los formatos de los bancos", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("B/. 12.50")).toBe(12.5);
    expect(parseAmount("(12.50)")).toBe(-12.5);
    expect(parseAmount("-3")).toBe(-3);
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount("")).toBeNull();
    expect(parseBankDate("26/09/2026")).toBe("2026-09-26");
    expect(parseBankDate("2026-09-26 14:03")).toBe("2026-09-26");
    expect(parseBankDate("5-9-26")).toBe("2026-09-05");
    expect(parseBankDate("12-sep-2026")).toBe("2026-09-12");
    expect(parseBankDate("32/01/2026")).toBeNull();
  });

  it("detecta encabezados bajo el título y toma solo los créditos", () => {
    const csv = [
      "Banco General - Estado de cuenta",
      "Cuenta,0401...",
      "Fecha;Descripción;Referencia;Débito;Crédito",
      "26/09/2026;PAGO YAPPY DE ANA;998877;;2,10",
      "26/09/2026;COMISION;;0,02;",
      "27/09/2026;TRANSFERENCIA ACH;;;15,00",
    ].join("\n");
    const parsed = parseBankStatement(csv);
    expect(parsed.lines).toEqual([
      { row: 1, date: "2026-09-26", description: "PAGO YAPPY DE ANA", reference: "998877", amount: 2.1 },
      { row: 3, date: "2026-09-27", description: "TRANSFERENCIA ACH", reference: "", amount: 15 },
    ]);
    expect(parsed.skipped).toBe(1);
    expect(() => parseBankStatement("a,b\n1,2")).toThrow(/columnas/);
  });
});

describe("conciliación", () => {
  const sale = (
    id: string,
    folio: number,
    date: string,
    total: number,
    reference: string | null = null
  ): ReconcileSale => ({
    id,
    folio,
    date,
    total,
    reference,
    method: "YAPPY",
  });

  it("cruza por referencia, por monto y fecha, y por lote diario", () => {
    const lines = [
      { row: 1, date: "2026-09-26", description: "YAPPY 998877", reference: "", amount: 2.1 },
      { row: 2, date: "2026-09-27", description: "YAPPY", reference: "", amount: 5 },
      { row: 3, date: "2026-09-27", description: "LOTE TARJETAS", reference: "", amount: 30 },
      { row: 4, date: "2026-09-28", description: "DEPÓSITO DESCONOCIDO", reference: "", amount: 99 },
    ];
    const sales = [
      sale("a", 1, "2026-09-26", 2.1, "998877"),
      sale("b", 2, "2026-09-26", 5),
      sale("c", 3, "2026-09-26", 10),
      sale("d", 4, "2026-09-26", 20),
      sale("e", 5, "2026-09-20", 7.5),
    ];
    const result = reconcile(lines, sales);
    expect(result.matches.map((m) => [m.line.row, m.type, m.sales.map((s) => s.id).join("+")])).toEqual([
      [1, "reference", "a"],
      [2, "amount", "b"],
      [3, "daily", "c+d"],
    ]);
    expect(result.unmatchedLines.map((l) => l.row)).toEqual([4]);
    expect(result.unmatchedSales.map((s) => s.id)).toEqual(["e"]);
    expect(result.totals).toMatchObject({
      deposits: 136.1,
      matchedDeposits: 37.1,
      unmatchedDeposits: 99,
      missingSales: 7.5,
    });
  });

  it("acepta depósitos netos de comisión", () => {
    const lines = [{ row: 1, date: "2026-09-26", description: "", reference: "", amount: 98.93 }];
    const result = reconcile(lines, [sale("a", 1, "2026-09-26", 100)], 0.0107);
    expect(result.matches[0]).toMatchObject({ type: "amount", difference: -1.07 });
    expect(reconcile(lines, [sale("a", 1, "2026-09-26", 100)]).matches).toEqual([]);
  });
});
