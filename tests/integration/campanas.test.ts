import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/dates";
import { cancelSale, createSale, getSale, receiptText } from "@/server/sales";
import {
  campaignDetail,
  createCampaign,
  listCoupons,
  markRecipientSent,
  previewSegment,
  renderMessage,
  saveCoupon,
  segmentCustomers,
  sendCampaign,
} from "@/server/campaigns";
import { consentFields } from "@/server/customers";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const TZ = "America/Mexico_City";
const DAY = 86_400_000;

describe("mensaje de la campaña", () => {
  it("personaliza nombre, puntos y cupón", () => {
    expect(
      renderMessage("Hola {nombre}, tienes {puntos} puntos. Usa {cupón} o {cupon}", {
        name: "María José Díaz",
        points: 120,
        coupon: "VUELVE10",
      })
    ).toBe("Hola María, tienes 120 puntos. Usa VUELVE10 o VUELVE10");
  });

  it("la fecha del consentimiento se guarda al aceptar y se conserva", () => {
    const first = consentFields(true, null);
    expect(first.consentAt).toBeInstanceOf(Date);
    const past = new Date("2026-01-01");
    expect(consentFields(true, { marketingConsent: true, consentAt: past }).consentAt).toBe(past);
    expect(consentFields(false, { marketingConsent: true, consentAt: past })).toEqual({
      marketingConsent: false,
      consentAt: null,
    });
  });
});

describe.skipIf(!hasDatabase)("campañas y cupones", () => {
  beforeEach(resetDatabase);
  afterEach(() => {
    delete process.env.WHATSAPP_PROVIDER;
  });

  async function setup() {
    const owner = await createOwner();
    const business = { id: owner.businessId, timezone: TZ };
    const product = await makeProduct(owner, { price: 20, stock: 100 });
    const month = dayKey(new Date(), TZ).slice(5, 7);
    const mk = (name: string, data: Record<string, unknown> = {}) =>
      prisma.customer.create({
        data: {
          name,
          phone: "6555-0101",
          marketingConsent: true,
          consentAt: new Date(),
          businessId: owner.businessId,
          ...data,
        },
      });
    const ana = await mk("Ana", { birthday: new Date(`1990-${month}-10T00:00:00Z`), tags: ["vip"], points: 80 });
    const beto = await mk("Beto");
    const noConsent = await mk("Carla", {
      marketingConsent: false,
      consentAt: null,
      birthday: new Date(`1990-${month}-02T00:00:00Z`),
    });
    const noPhone = await mk("Dani", { phone: null, tags: ["vip"] });
    return { owner, business, product, ana, beto, noConsent, noPhone };
  }

  it("solo reciben campañas los clientes que aceptaron y tienen teléfono", async () => {
    const { owner, business, product, ana, beto } = await setup();
    const names = async (segment: Parameters<typeof segmentCustomers>[1]) =>
      (await segmentCustomers(business, segment)).map((c) => c.name);
    expect(await names({ type: "ALL" })).toEqual(["Ana", "Beto"]);
    expect(await names({ type: "BIRTHDAY" })).toEqual(["Ana"]);
    expect(await names({ type: "TAG", tag: "VIP" })).toEqual(["Ana"]);

    // Beto compró hace 40 días y no volvió; Ana compró 4 veces este mes.
    const old = await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { customerId: beto.id }));
    await prisma.sale.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 40 * DAY) } });
    for (let i = 0; i < 4; i++) {
      await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { customerId: ana.id }));
    }
    expect(await names({ type: "INACTIVE", days: 30 })).toEqual(["Beto"]);
    expect(await names({ type: "FREQUENT", visits: 4, days: 90 })).toEqual(["Ana"]);
    await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: beto.id })
    );
    await prisma.sale.updateMany({
      where: { customerId: beto.id, paymentMethod: "CREDIT" },
      data: { dueDate: new Date(Date.now() - DAY) },
    });
    expect(await names({ type: "OVERDUE" })).toEqual(["Beto"]);
    expect((await previewSegment(business, { type: "ALL" })).count).toBe(2);
  });

  it("el cupón se aplica en la venta, respeta sus límites y se devuelve al cancelar", async () => {
    const { owner, product, ana } = await setup();
    const coupon = await saveCoupon(owner, {
      code: "vuelve 10",
      kind: "PERCENT",
      value: 0.1,
      minPurchase: 30,
      startsAt: null,
      endsAt: null,
      maxUses: 1,
      active: true,
    });
    expect(coupon.code).toBe("VUELVE10");
    await expect(
      createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { couponCode: "VUELVE10" }))
    ).rejects.toThrow(/desde 30.00/);
    const sale = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 2 }], { couponCode: "vuelve10", discount: 5, customerId: ana.id })
    );
    // (40 − 5 de descuento) × 10% = 3.50
    expect(sale.couponDiscount.toNumber()).toBe(3.5);
    expect(sale.total.toNumber()).toBe(31.5);
    const text = receiptText(await getSale(owner.businessId, sale.id), {
      name: "Tienda",
      currency: "USD",
      locale: "es-PA",
      timezone: TZ,
    });
    expect(text).toContain("Cupón VUELVE10");
    await expect(
      createSale(owner, saleInput([{ productId: product.id, quantity: 2 }], { couponCode: "VUELVE10" }))
    ).rejects.toThrow(/todas las veces/);
    await cancelSale(owner, sale.id, "Error");
    expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).uses).toBe(0);

    const amount = await saveCoupon(owner, {
      code: "MENOS5",
      kind: "AMOUNT",
      value: 50,
      minPurchase: null,
      startsAt: null,
      endsAt: new Date(Date.now() - DAY),
      maxUses: null,
      active: true,
    });
    await expect(
      createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { couponCode: amount.code }))
    ).rejects.toThrow(/venció/);
    await saveCoupon(owner, { ...amount, endsAt: null, minPurchase: null, value: 50 }, amount.id);
    const capped = await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { couponCode: amount.code })
    );
    // El descuento nunca pasa del total.
    expect(capped.total.toNumber()).toBe(0);
    await expect(
      createSale(
        { ...owner, features: [] },
        saleInput([{ productId: product.id, quantity: 1 }], { couponCode: amount.code })
      )
    ).rejects.toThrow(/Tu plan no incluye/);
  });

  it("campaña: destinatarios, envío asistido, envío por API y resultados", async () => {
    const { owner, product, ana, beto } = await setup();
    const coupon = await saveCoupon(owner, {
      code: "CUMPLE",
      kind: "AMOUNT",
      value: 2,
      minPurchase: null,
      startsAt: null,
      endsAt: null,
      maxUses: null,
      active: true,
    });
    await expect(
      createCampaign(
        { ...owner, timezone: TZ },
        { name: "X", message: "Usa {cupón}", segment: { type: "ALL" }, couponId: null }
      )
    ).rejects.toThrow(/elige un cupón/);
    const campaign = await createCampaign(
      { ...owner, timezone: TZ },
      {
        name: "Cumpleaños",
        message: "¡Feliz cumpleaños, {nombre}! Tienes {puntos} puntos y el cupón {cupón}.",
        segment: { type: "ALL" },
        couponId: coupon.id,
      }
    );
    let detail = await campaignDetail(owner.businessId, campaign.id);
    expect(detail.recipients.map((r) => r.message)).toEqual([
      "¡Feliz cumpleaños, Ana! Tienes 80 puntos y el cupón CUMPLE.",
      "¡Feliz cumpleaños, Beto! Tienes 0 puntos y el cupón CUMPLE.",
    ]);
    expect(detail.apiEnabled).toBe(false);
    await expect(sendCampaign({ ...owner, country: "PA" }, campaign.id)).rejects.toThrow(/asistido/);

    await markRecipientSent(owner, detail.recipients[0].id);
    process.env.WHATSAPP_PROVIDER = "simulado";
    await prisma.customer.update({ where: { id: beto.id }, data: { phone: "6000-0000" } });
    await prisma.campaignRecipient.updateMany({ where: { customerId: beto.id }, data: { phone: "6000-0000" } });
    expect(await sendCampaign({ ...owner, country: "PA" }, campaign.id)).toEqual({ sent: 0, failed: 1 });

    await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { customerId: ana.id, couponCode: "CUMPLE" })
    );
    await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }], { customerId: ana.id }));
    detail = await campaignDetail(owner.businessId, campaign.id);
    expect(detail.status).toBe("SENT");
    expect(detail.results).toMatchObject({ buyers: 1, sales: 2, redemptions: 1 });
    expect(detail.results.salesTotal.toNumber()).toBe(38);
    expect(detail.results.discountTotal.toNumber()).toBe(2);
    expect(detail.results.conversion.toNumber()).toBe(50);
    const coupons = await listCoupons(owner.businessId);
    expect(coupons[0]).toMatchObject({ code: "CUMPLE", redemptions: 1, uses: 1 });
  });
});
