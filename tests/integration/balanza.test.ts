import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ean13CheckDigit } from "@/lib/barcode";
import { labelQuantity, matchesPlu, parseWeightBarcode, weightBarcodeFormat } from "@/lib/scale";
import { createSale } from "@/server/sales";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const ean = (first12: string) => `${first12}${ean13CheckDigit(first12)}`;

describe.skipIf(!hasDatabase)("etiquetas de peso", () => {
  beforeEach(resetDatabase);

  it("el formato guardado se lee con los valores por defecto del país", async () => {
    const owner = await createOwner();
    const business = await prisma.business.update({
      where: { id: owner.businessId },
      data: { country: "PA", weightBarcode: { valueType: "PRICE", decimals: 2 } },
    });
    expect(weightBarcodeFormat(business.weightBarcode, business.country)).toEqual({
      enabled: true,
      valueType: "PRICE",
      pluDigits: 5,
      decimals: 2,
      weightUnit: "LB",
    });
  });

  it("vende la cantidad de la etiqueta y descuenta el peso del inventario", async () => {
    const owner = await createOwner();
    const ham = await makeProduct(owner, { unit: "LB", sku: "00406", price: 3.5, stock: 10, taxRate: 0 });
    await makeProduct(owner, { unit: "LB", sku: "00407", price: 2, stock: 10, taxRate: 0 });
    const format = weightBarcodeFormat(null, "PA");
    const label = parseWeightBarcode(ean("200040601250"), format)!;
    const products = await prisma.product.findMany({ where: { businessId: owner.businessId } });
    const found = products.find((p) => matchesPlu(p, label.plu))!;
    expect(found.id).toBe(ham.id);
    const quantity = labelQuantity(label.value, format, { unit: found.unit, price: Number(found.price) })!;
    const sale = await createSale(owner, saleInput([{ productId: found.id, quantity }]));
    expect(Number(sale.total)).toBe(4.38);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: ham.id } });
    expect(Number(after.stock)).toBe(8.75);
  });
});
