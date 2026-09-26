import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("escapa comillas, comas y saltos de línea", () => {
    const csv = toCsv(["Nombre", "Nota"], [['Refresco "grande"', "a,b"], ["Pan", "línea\nnueva"]]);
    expect(csv).toBe('﻿Nombre,Nota\r\n"Refresco ""grande""","a,b"\r\nPan,"línea\nnueva"');
  });

  it("neutraliza fórmulas para evitar inyección en Excel", () => {
    expect(toCsv(["x"], [["=HYPERLINK(1)"], ["-12.5"], ["@SUM(A1)"]])).toBe("﻿x\r\n'=HYPERLINK(1)\r\n-12.5\r\n'@SUM(A1)");
  });

  it("lee CSV con comillas y BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","z ""q"""\n1,2\n')).toEqual([
      ["a", "b"],
      ["x, y", 'z "q"'],
      ["1", "2"],
    ]);
  });

  it("detecta punto y coma (Excel en español)", () => {
    expect(parseCsv("Nombre;Precio\nPan;12,5")).toEqual([
      ["Nombre", "Precio"],
      ["Pan", "12,5"],
    ]);
  });
});
