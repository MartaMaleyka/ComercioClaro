import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/server/account";
import { cancelSale, createSale, returnSale, type SalesActor } from "@/server/sales";
import { closeCashSession, openCashSession } from "@/server/cash";
import { cashierReport, monthRange, taxReport } from "@/server/insights";
import { hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

async function panamaOwner(settings: Record<string, unknown> = {}): Promise<SalesActor> {
  const { user, businessId } = await registerAccount({
    email: `comp-${Date.now()}-${Math.random()}@test.com`,
    password: "12345678",
    name: "Wei",
    businessName: "Minisúper",
    country: "PA",
  });
  if (Object.keys(settings).length > 0) await prisma.business.update({ where: { id: businessId }, data: settings });
  return { userId: user.id, businessId, role: "OWNER" };
}

async function addCashier(owner: SalesActor, name = "Li Na"): Promise<SalesActor> {
  const user = await prisma.user.create({
    data: {
      email: `cajero-${Date.now()}-${Math.random()}@test.com`,
      passwordHash: "x",
      name,
      memberships: { create: { role: "CASHIER", businessId: owner.businessId } },
    },
  });
  return { userId: user.id, businessId: owner.businessId, role: "CASHIER" };
}

async function business(actor: SalesActor) {
  return prisma.business.findUniqueOrThrow({ where: { id: actor.businessId } });
}

describe.skipIf(!hasDatabase)("reporte de ITBMS", () => {
  beforeEach(resetDatabase);

  it("separa base e impuesto por tasa, prorratea el descuento y resta devoluciones", async () => {
    const owner = await panamaOwner();
    const soda = await makeProduct(owner, { price: 10.7, taxRate: 0.07 });
    const rice = await makeProduct(owner, { price: 5, taxRate: 0 });
    const sale = await createSale(
      owner,
      saleInput(
        [
          { productId: soda.id, quantity: 2 },
          { productId: rice.id, quantity: 1 },
        ],
        { discount: 2.64 }
      )
    );
    expect(Number(sale.total)).toBe(23.76);

    const b = await business(owner);
    let report = await taxReport(b);
    expect(report.taxName).toBe("ITBMS");
    const taxed = report.lines.find((l) => l.taxRate === 0.07)!;
    expect(taxed).toMatchObject({ sales: 19.26, returns: 0, total: 19.26, base: 18, tax: 1.26 });
    expect(report.lines.find((l) => l.taxRate === 0)).toMatchObject({ total: 4.5, base: 4.5, tax: 0 });
    expect(report.totals).toMatchObject({ total: 23.76, tax: 1.26 });

    const sodaItem = sale.items.find((i) => i.productId === soda.id)!;
    await returnSale(owner, sale.id, { items: [{ saleItemId: sodaItem.id, quantity: 1 }], refundMethod: "CASH", reason: "Dañada" });
    report = await taxReport(b);
    expect(report.lines.find((l) => l.taxRate === 0.07)).toMatchObject({ returns: 9.63, total: 9.63, base: 9, tax: 0.63 });

    // Otro mes: sin ventas.
    const empty = await taxReport(b, "2020-01");
    expect(empty.lines).toEqual([]);
    expect(monthRange("America/Panama", "2024-12")).toMatchObject({ fromKey: "2024-12-01", toKey: "2024-12-31" });
  });
});

describe.skipIf(!hasDatabase)("desempeño por cajero", () => {
  beforeEach(resetDatabase);

  it("suma ventas, descuentos manuales, cancelaciones y faltantes por persona", async () => {
    const owner = await panamaOwner();
    const cashier = await addCashier(owner);
    const p = await makeProduct(owner, { price: 10, taxRate: 0, stock: 100 });

    await openCashSession(cashier, { openingAmount: 20, notes: null });
    await createSale(cashier, saleInput([{ productId: p.id, quantity: 2, discount: 1 }]));
    await createSale(cashier, saleInput([{ productId: p.id, quantity: 1 }]));
    const toCancel = await createSale(owner, saleInput([{ productId: p.id, quantity: 3 }], { discount: 2 }));
    await cancelSale(owner, toCancel.id, "Error de cobro");
    await createSale(owner, saleInput([{ productId: p.id, quantity: 1 }]));
    // Esperado: 20 + 19 + 10 + 10 (la venta cancelada se devuelve de la misma caja) = 59; contó 54.
    await closeCashSession(cashier, { countedAmount: 54, notes: null });

    const range = monthRange("America/Panama");
    const rows = await cashierReport(owner.businessId, { start: range.start, end: new Date(Date.now() + 60_000) });
    const li = rows.find((r) => r.userId === cashier.userId)!;
    const wei = rows.find((r) => r.userId === owner.userId)!;
    expect(li).toMatchObject({ name: "Li Na", role: "CASHIER", salesCount: 2, salesTotal: 29, discounts: 1, closings: 1, shortages: 5 });
    expect(li.averageTicket).toBe(14.5);
    // La venta cancelada no cuenta como venta ni su descuento; sí la cancelación.
    expect(wei).toMatchObject({ salesCount: 1, salesTotal: 10, discounts: 0, cancellations: 1 });
  });
});
