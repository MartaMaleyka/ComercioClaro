import { describe, expect, it } from "vitest";
import { missingTexts } from "@/lib/i18n-text";
import { BULK_SPECS, checkRow, dateCell, mapTable, normalizeHeader, parseTable, templateCsv, toInput } from "@/lib/bulk";

describe("carga masiva: lectura de lo pegado desde Excel", () => {
  it("reconoce encabezados con acentos, asterisco, mayúsculas y otros nombres", () => {
    expect(normalizeHeader("  Código de Barras* ")).toBe("codigo de barras");
    const pasted = "Producto\tPRECIO\tCodigo\tColor\n Arroz 5 lb \t$3.95\t750123\trojo\n";
    const table = mapTable(BULK_SPECS.products, parseTable(pasted));
    expect(table.mapping).toEqual(["name", "price", "barcode", null]);
    expect(table.ignored).toEqual(["Color"]);
    expect(table.missing).toEqual([]);
    expect(table.records).toEqual([{ name: "Arroz 5 lb", price: "$3.95", barcode: "750123" }]);
  });

  it("avisa si falta una columna obligatoria", () => {
    const table = mapTable(BULK_SPECS.products, parseTable("Nombre;Costo\nArroz;3"));
    expect(table.missing).toEqual(["Precio"]);
  });

  it("lee montos, fechas, sí/no, unidades, impuestos y formas de pago", () => {
    expect(dateCell("5/9/2026")).toBe("2026-09-05");
    expect(dateCell("2026-9-5")).toBe("2026-09-05");
    expect(dateCell("05-09-26")).toBe("2026-09-05");
    expect(toInput("products", { name: "A", price: "B/. 1,250.50", unit: "Libras", taxRate: "7%" })).toMatchObject({
      price: "1250.50",
      unit: "LB",
      taxRate: "0.07",
    });
    expect(toInput("products", { name: "A", price: "1", taxRate: "exento" })).toMatchObject({ taxRate: "0" });
    expect(toInput("customers", { name: "A", marketingConsent: "Sí", isSenior: "no", tags: "vecina; frecuente" })).toMatchObject({
      marketingConsent: true,
      isSenior: false,
      tags: ["vecina", "frecuente"],
    });
    expect(toInput("expenses", { paymentMethod: "Transferencia", amount: "$85.40" })).toMatchObject({
      paymentMethod: "TRANSFER",
      amount: "85.40",
    });
    expect(toInput("employees", { frequency: "mensual", hireDate: "01/02/2025" })).toMatchObject({
      frequency: "MENSUAL",
      hireDate: "2025-02-01",
    });
  });

  it("valida cada fila y nombra la columna como en la plantilla", () => {
    expect(checkRow("products", { name: "Arroz", price: "3.95" }).ok).toBe(true);
    const bad = checkRow("products", { name: "Arroz", price: "tres" });
    expect(bad).toEqual({ ok: false, error: "Precio: Debe ser un número" });
    const noName = checkRow("customers", { phone: "6000-0000" });
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.error).toMatch(/^Nombre:/);
    const email = checkRow("suppliers", { name: "Distri", email: "no-es-correo" });
    expect(email).toEqual({ ok: false, error: "Correo: Correo inválido" });
  });

  it("la plantilla trae los encabezados y un ejemplo que pasa la validación", () => {
    for (const spec of Object.values(BULK_SPECS)) {
      const table = mapTable(spec, parseTable(templateCsv(spec)));
      expect(table.missing).toEqual([]);
      expect(table.ignored).toEqual([]);
      expect(table.records).toHaveLength(1);
      const check = checkRow(spec.entity, table.records[0]);
      expect(check.ok, `${spec.entity}: ${JSON.stringify(check)}`).toBe(true);
    }
  });

  it("formas de pago y frecuencias en palabras, sin importar acentos", () => {
    expect(toInput("expenses", { paymentMethod: "Tarjeta de Débito" })).toMatchObject({ paymentMethod: "CARD" });
    expect(toInput("expenses", { paymentMethod: " Depósito " })).toMatchObject({ paymentMethod: "TRANSFER" });
    expect(toInput("expenses", { paymentMethod: "YAPPY" })).toMatchObject({ paymentMethod: "YAPPY" });
    expect(toInput("employees", { frequency: "Quincena" })).toMatchObject({ frequency: "QUINCENAL" });
    expect(toInput("employees", { frequency: "cada mes" })).toMatchObject({ frequency: "MENSUAL" });
    const bad = checkRow("employees", { name: "Ana", salary: "650", hireDate: "01/02/2025", frequency: "semanal" });
    expect(bad).toEqual({ ok: false, error: "Frecuencia: Frecuencia inválida: usa quincenal o mensual" });
    const pago = checkRow("expenses", { date: "01/08/2026", category: "Luz", amount: "10", paymentMethod: "cheque" });
    expect(pago).toEqual({ ok: false, error: "Forma de pago: Forma de pago inválida" });
  });

  it.each(["en", "zh"])("los textos de cada tipo tienen traducción en %s", (language) => {
    const texts = Object.values(BULK_SPECS).flatMap((s) => [
      s.noun,
      s.matchBy,
      ...(s.note ? [s.note] : []),
      ...s.columns.map((c) => c.label),
    ]);
    expect(missingTexts(language, texts)).toEqual([]);
  });
});
