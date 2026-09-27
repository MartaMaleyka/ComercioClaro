import { describe, expect, it } from "vitest";
import { ean13CheckDigit } from "@/lib/barcode";
import {
  convertWeight,
  defaultWeightBarcode,
  labelQuantity,
  matchesPlu,
  parseScaleReading,
  parseWeightBarcode,
  weightBarcodeFormat,
  type WeightBarcodeFormat,
} from "@/lib/scale";

const ean = (first12: string) => `${first12}${ean13CheckDigit(first12)}`;
const weightFormat: WeightBarcodeFormat = defaultWeightBarcode("PA");

describe("lectura de la balanza", () => {
  it("reconoce los formatos comunes", () => {
    expect(parseScaleReading("ST,GS,+  1.234kg")).toEqual({ weight: 1.234, unit: "KG", stable: true });
    expect(parseScaleReading("\x02 001.25 lb")).toEqual({ weight: 1.25, unit: "LB", stable: true });
    expect(parseScaleReading("0,500")).toEqual({ weight: 0.5, unit: null, stable: true });
  });

  it("marca las lecturas inestables", () => {
    expect(parseScaleReading("US,GS, 0.500 kg")?.stable).toBe(false);
    expect(parseScaleReading("?0.480lb")?.stable).toBe(false);
  });

  it("descarta líneas sin número", () => {
    expect(parseScaleReading("ERROR")).toBeNull();
    expect(parseScaleReading("")).toBeNull();
  });

  it("convierte entre unidades", () => {
    expect(convertWeight(1, "KG", "LB")).toBe(2.205);
    expect(convertWeight(1, "LB", "KG")).toBe(0.454);
    expect(convertWeight(500, "G", "KG")).toBe(0.5);
    expect(convertWeight(16, "OZ", "LB")).toBe(1);
  });
});

describe("etiquetas de peso", () => {
  it("usa libras por defecto en Panamá y kilos en los demás", () => {
    expect(defaultWeightBarcode("PA").weightUnit).toBe("LB");
    expect(defaultWeightBarcode("MX").weightUnit).toBe("KG");
  });

  it("completa el formato guardado con los valores por defecto", () => {
    expect(weightBarcodeFormat(null, "PA")).toEqual(weightFormat);
    expect(weightBarcodeFormat({ valueType: "PRICE", decimals: 2, pluDigits: 9 }, "MX")).toEqual({
      enabled: true,
      valueType: "PRICE",
      pluDigits: 5,
      decimals: 2,
      weightUnit: "KG",
    });
  });

  it("lee el PLU y el peso de una etiqueta EAN-13", () => {
    expect(parseWeightBarcode(ean("200040601250"), weightFormat)).toEqual({
      plu: "00406",
      pluNumber: "406",
      value: 1.25,
    });
  });

  it("rechaza códigos que no son etiquetas de peso", () => {
    expect(parseWeightBarcode("200040601250" + "0", weightFormat)).toBeNull(); // verificador malo
    expect(parseWeightBarcode(ean("750104060125"), weightFormat)).toBeNull(); // no empieza con 2
    expect(parseWeightBarcode(ean("200040600000"), weightFormat)).toBeNull(); // peso cero
    expect(parseWeightBarcode(ean("200040601250"), { ...weightFormat, enabled: false })).toBeNull();
  });

  it("respeta los dígitos del PLU y los decimales", () => {
    const format: WeightBarcodeFormat = { ...weightFormat, pluDigits: 4, decimals: 2, valueType: "PRICE" };
    expect(parseWeightBarcode(ean("210406004375"), format)).toEqual({ plu: "0406", pluNumber: "406", value: 43.75 });
  });

  it("encuentra el producto por código de barras o SKU, con o sin ceros", () => {
    expect(matchesPlu({ barcode: null, sku: "00406" }, "00406")).toBe(true);
    expect(matchesPlu({ barcode: "406", sku: null }, "00406")).toBe(true);
    expect(matchesPlu({ barcode: null, sku: "407" }, "00406")).toBe(false);
    expect(matchesPlu({ barcode: null, sku: null }, "00406")).toBe(false);
  });

  it("calcula la cantidad desde el peso o el precio", () => {
    expect(labelQuantity(1.25, weightFormat, { unit: "LB", price: 3.5 })).toBe(1.25);
    expect(labelQuantity(1, { ...weightFormat, weightUnit: "KG" }, { unit: "LB", price: 3.5 })).toBe(2.205);
    expect(labelQuantity(4.375, { ...weightFormat, valueType: "PRICE" }, { unit: "LB", price: 3.5 })).toBe(1.25);
    expect(labelQuantity(1.25, weightFormat, { unit: "PIECE", price: 3.5 })).toBeNull();
    expect(labelQuantity(4, { ...weightFormat, valueType: "PRICE" }, { unit: "LB", price: 0 })).toBeNull();
  });
});
