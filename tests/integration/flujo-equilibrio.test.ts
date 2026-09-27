import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addDays, dayKey } from "@/lib/dates";
import { createSale } from "@/server/sales";
import { createSupplierBill } from "@/server/payables";
import {
  breakEven,
  cashflowProjection,
  createRecurringExpense,
  generateRecurringExpenses,
  occurrencesBetween,
} from "@/server/cashflow";
import { createOwner, hasDatabase, makeProduct, resetDatabase, saleInput } from "../helpers";

const TZ = "America/Mexico_City";
const DAY = 86_400_000;

describe("fechas de los gastos recurrentes", () => {
  it("el día 31 cae el último día en meses cortos", () => {
    expect(occurrencesBetween(31, "2026-01-15", "2026-04-10")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(occurrencesBetween(5, "2026-12-06", "2027-01-05")).toEqual(["2027-01-05"]);
  });
});

describe.skipIf(!hasDatabase)("flujo de caja y punto de equilibrio", () => {
  beforeEach(resetDatabase);

  it("registra el gasto recurrente del mes una sola vez", async () => {
    const owner = await createOwner();
    const today = dayKey(new Date(), TZ);
    const day = Number(today.slice(8, 10));
    const rent = await createRecurringExpense(owner, {
      category: "Renta",
      description: null,
      amount: 300,
      dayOfMonth: day,
      paymentMethod: "TRANSFER",
      active: true,
    });
    expect(rent.lastGenerated).toBeNull();
    expect((await generateRecurringExpenses()).created).toBe(1);
    expect((await generateRecurringExpenses()).created).toBe(0);
    const expenses = await prisma.expense.findMany({ where: { businessId: owner.businessId } });
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ category: "Renta", recurringId: rent.id });
    expect(dayKey(expenses[0].date, TZ)).toBe(today);

    // Un gasto cuyo día ya pasó este mes empieza el mes siguiente.
    if (day > 1) {
      const light = await createRecurringExpense(owner, {
        category: "Luz",
        description: null,
        amount: 40,
        dayOfMonth: day - 1,
        paymentMethod: "CASH",
        active: true,
      });
      expect(light.lastGenerated).toBe(today.slice(0, 7));
    }
    // El mes siguiente se vuelve a registrar.
    expect((await generateRecurringExpenses(new Date(Date.now() + 32 * DAY))).created).toBeGreaterThanOrEqual(1);
  });

  it("proyecta entradas y salidas semana a semana y avisa si el saldo baja de cero", async () => {
    const owner = await createOwner();
    const product = await makeProduct(owner, { price: 56, cost: 20, stock: 100 });
    const customer = await prisma.customer.create({
      data: { name: "Aurelio", creditDays: 15, businessId: owner.businessId },
    });
    // Una venta de hace una semana (mismo día de la semana que hoy): 56 ÷ 8 semanas = 7 por ese día.
    const sale = await createSale(owner, saleInput([{ productId: product.id, quantity: 1 }]));
    await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: new Date(Date.now() - 7 * DAY) } });
    // Fiado que vence en 15 días y una factura por pagar en 3.
    await createSale(
      owner,
      saleInput([{ productId: product.id, quantity: 1 }], { paymentMethod: "CREDIT", customerId: customer.id })
    );
    const today = dayKey(new Date(), TZ);
    await createSupplierBill(owner, { supplierName: "Hielo", total: 100, dueDate: addDays(today, 3) });

    const projection = await cashflowProjection({ id: owner.businessId, timezone: TZ }, { days: 30, opening: 0 });
    expect(projection.weeks).toHaveLength(5);
    expect(projection.weeks[0].sales.toNumber()).toBe(7);
    expect(projection.weeks[0].payables.toNumber()).toBe(100);
    expect(projection.weeks[0].balance.toNumber()).toBe(-93);
    expect(projection.negativeWeek).toEqual({ start: today, balance: projection.weeks[0].balance });
    expect(projection.totals.inflows.toNumber()).toBe(35 + 56);
    const collections = projection.weeks.map((w) => w.collections.toNumber());
    expect(collections.reduce((a, b) => a + b, 0)).toBe(56);
    expect(projection.closing.toNumber()).toBe(-9);

    // Sin saldo inicial se toma el efectivo esperado de la caja (sin caja abierta, 0).
    const noOpening = await cashflowProjection({ id: owner.businessId, timezone: TZ }, { days: 60 });
    expect(noOpening.openingSource).toBe("none");
    expect(noOpening.weeks).toHaveLength(9);
  });

  it("cuenta cada gasto recurrente en las fechas que le tocan", async () => {
    const owner = await createOwner();
    const today = dayKey(new Date(), TZ);
    await createRecurringExpense(owner, {
      category: "Internet",
      description: null,
      amount: 25,
      dayOfMonth: 20,
      paymentMethod: "TRANSFER",
      active: true,
    });
    const projection = await cashflowProjection({ id: owner.businessId, timezone: TZ }, { days: 90, opening: 1000 });
    const expected = occurrencesBetween(20, today, addDays(today, 89)).filter(
      (k) => !(k.slice(0, 7) === today.slice(0, 7) && Number(today.slice(8)) > 20)
    ).length;
    expect(projection.totals.outflows.toNumber()).toBe(25 * expected);
  });

  it("punto de equilibrio con el margen real y los gastos fijos", async () => {
    const owner = await createOwner();
    const product = await makeProduct(owner, { price: 100, cost: 60, stock: 100 });
    const sale = await createSale(owner, saleInput([{ productId: product.id, quantity: 9 }]));
    await prisma.sale.update({ where: { id: sale.id }, data: { createdAt: new Date(Date.now() - 10 * DAY) } });
    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });

    // Sin gastos recurrentes: el promedio mensual de los gastos de los últimos 90 días.
    await prisma.expense.create({
      data: { category: "Luz", amount: 90, date: new Date(Date.now() - 5 * DAY), businessId: owner.businessId },
    });
    let result = await breakEven({ ...business, timezone: TZ });
    expect(result.marginPercent.toNumber()).toBe(40);
    expect(result.fixedSource).toBe("expenses");
    expect(result.fixedCosts.toNumber()).toBe(30);
    expect(result.breakEvenSales?.toNumber()).toBe(75);

    await createRecurringExpense(owner, {
      category: "Renta",
      description: null,
      amount: 200,
      dayOfMonth: 1,
      paymentMethod: "TRANSFER",
      active: true,
    });
    result = await breakEven({ ...business, timezone: TZ });
    expect(result.fixedSource).toBe("recurring");
    expect(result.breakEvenSales?.toNumber()).toBe(500);
    // 900 en 90 días = 10 por día: se necesitan 50 días, más de los que tiene el mes.
    expect(result.dailySales.toNumber()).toBe(10);
    expect(result.daysNeeded).toBe(50);
    expect(result.reachable).toBe(false);
  });
});
