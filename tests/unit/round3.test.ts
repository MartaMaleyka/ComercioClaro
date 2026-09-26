import crypto from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildPanamaDocument, itbmsCode } from "@/server/einvoice/document";
import { bestPromotion, promotionDiscount, type PromotionRule } from "@/lib/promotions";
import { ean13CheckDigit, internalEan13, isValidEan13, symbologyFor } from "@/lib/barcode";
import { verifyYappyHash } from "@/server/yappy";

const promo = (over: Partial<PromotionRule>): PromotionRule => ({
  id: "p",
  name: "Promo",
  type: "PERCENT",
  percent: null,
  buyQty: null,
  payQty: null,
  bundleQty: null,
  bundlePrice: null,
  productId: "prod",
  categoryId: null,
  startsAt: null,
  endsAt: null,
  active: true,
  ...over,
});

describe("factura electrónica DGI", () => {
  it("usa los códigos de tasa de ITBMS", () => {
    expect([0, 0.07, 0.1, 0.15].map(itbmsCode)).toEqual(["00", "01", "02", "03"]);
    expect(() => itbmsCode(0.16)).toThrow();
  });

  it("arma el documento con ITBMS desglosado, consumidor final y descuento prorrateado", () => {
    const doc = buildPanamaDocument(
      {
        folio: 7,
        createdAt: new Date("2026-09-26T15:00:00Z"),
        paymentMethod: "YAPPY",
        subtotal: 12.14,
        total: 11.14, // B/.1.00 de descuento general
        items: [
          { quantity: 2, returnedQuantity: 0, subtotal: 2.14, taxRate: 0.07, product: { id: "a", name: "Refresco", barcode: "1", sku: null } },
          { quantity: 10, returnedQuantity: 0, subtotal: 10, taxRate: 0, product: { id: "b", name: "Arroz", barcode: null, sku: "ARZ" } },
        ],
      },
      { ruc: "8-812-2345", dv: "45", name: "Minisúper", legalName: "Wei Chen" },
      null
    );
    expect(doc.receiver).toEqual({ type: "02", name: "Consumidor final", email: null });
    expect(doc.number).toBe("0000000007");
    expect(doc.items[0]).toMatchObject({ taxCode: "01", code: "1" });
    expect(doc.items[1]).toMatchObject({ taxCode: "00", itbms: 0, code: "ARZ" });
    expect(doc.totals.total).toBe(11.14);
    expect(Math.round((doc.totals.subtotal + doc.totals.itbms) * 100) / 100).toBe(11.14);
    expect(doc.payments).toEqual([{ code: "99", description: "Yappy", amount: 11.14 }]);
  });

  it("usa el RUC del cliente contribuyente", () => {
    const doc = buildPanamaDocument(
      {
        folio: 1,
        createdAt: new Date(),
        paymentMethod: "CASH",
        subtotal: 10.7,
        total: 10.7,
        items: [{ quantity: 1, returnedQuantity: 0, subtotal: 10.7, taxRate: 0.07, product: { id: "a", name: "X", barcode: null, sku: null } }],
      },
      { ruc: "8-1-1", dv: "1", name: "N" },
      { ruc: "155-1-2021", dv: "33", name: "Cliente SA", email: "a@b.com" }
    );
    expect(doc.receiver).toMatchObject({ type: "01", ruc: "155-1-2021", dv: "33" });
    expect(doc.items[0]).toMatchObject({ subtotal: 10, itbms: 0.7 });
    expect(doc.payments[0].code).toBe("02");
  });
});

describe("promociones", () => {
  it("2x1, 3 por B/.1 y porcentaje", () => {
    expect(promotionDiscount(promo({ type: "BUY_X_PAY_Y", buyQty: 2, payQty: 1 }), 5, 1.1)).toBe(2.2);
    expect(promotionDiscount(promo({ type: "BUNDLE_PRICE", bundleQty: 3, bundlePrice: 1 }), 7, 0.4)).toBe(0.4);
    expect(promotionDiscount(promo({ type: "PERCENT", percent: 0.1 }), 3, 3.25)).toBe(0.98);
  });

  it("elige la de mayor descuento y respeta fechas y alcance", () => {
    const list = [
      promo({ id: "a", type: "PERCENT", percent: 0.05 }),
      promo({ id: "b", type: "BUY_X_PAY_Y", buyQty: 2, payQty: 1 }),
      promo({ id: "c", type: "PERCENT", percent: 0.9, endsAt: "2020-01-01" }),
      promo({ id: "d", type: "PERCENT", percent: 0.5, productId: null, categoryId: "otra" }),
    ];
    const best = bestPromotion(list, { productId: "prod", categoryId: "cat", quantity: 2, unitPrice: 1 });
    expect(best?.promotion.id).toBe("b");
    expect(best?.discount).toBe(1);
  });
});

describe("códigos de barras", () => {
  it("valida EAN-13 y genera códigos internos válidos con prefijo 20", () => {
    expect(ean13CheckDigit("750105530007")).toBe("5");
    expect(isValidEan13("7501055300075")).toBe(true);
    expect(isValidEan13("7501055300076")).toBe(false);
    const code = internalEan13();
    expect(code).toMatch(/^20\d{11}$/);
    expect(isValidEan13(code)).toBe(true);
    expect(symbologyFor(code)).toBe("ean13");
    expect(symbologyFor("ABC-123")).toBe("code128");
  });
});

describe("IPN de Yappy", () => {
  afterEach(() => {
    delete process.env.YAPPY_SECRET_KEY;
  });

  it("acepta solo notificaciones firmadas con la clave del comercio", () => {
    const key = "clave-super-secreta";
    process.env.YAPPY_SECRET_KEY = Buffer.from(`${key}.extra`).toString("base64");
    const hash = crypto.createHmac("sha256", key).update("CC123" + "E" + "tienda.com").digest("hex");
    expect(verifyYappyHash({ orderId: "CC123", status: "E", domain: "tienda.com", hash })).toBe(true);
    expect(verifyYappyHash({ orderId: "CC123", status: "E", domain: "tienda.com", hash: hash.replace(/.$/, "0") })).toBe(false);
    expect(verifyYappyHash({ orderId: "CC124", status: "E", domain: "tienda.com", hash })).toBe(false);
  });
});
