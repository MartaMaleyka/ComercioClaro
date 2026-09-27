import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/dates";
import { payPeriod } from "@/lib/payroll";
import { cashSessionSummary, openCashSession } from "@/server/cash";
import {
  createAdvance,
  createEmployee,
  createPayrollRun,
  deletePayrollRun,
  listEmployees,
  payPayrollContributions,
  payPayrollRun,
  updatePayrollLine,
} from "@/server/payroll";
import { ACCOUNTS, closePeriod, financialStatements, monthKeys } from "@/server/accounting";
import { breakEven, cashflowProjection } from "@/server/cashflow";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

const TZ = "America/Panama";

describe.skipIf(!hasDatabase)("planilla", () => {
  beforeEach(resetDatabase);

  async function setup() {
    const owner = await createOwner();
    await prisma.business.update({ where: { id: owner.businessId }, data: { country: "PA", timezone: TZ } });
    const today = dayKey(new Date(), TZ);
    const ana = await createEmployee(owner, {
      name: "Ana",
      idNumber: "8-123-456",
      socialSecurityNumber: "123456",
      position: "Cajera",
      salary: 900,
      frequency: "QUINCENAL",
      hireDate: "2024-01-10",
      vacationSince: null,
      active: true,
    });
    await createEmployee(owner, {
      name: "Beto",
      idNumber: null,
      socialSecurityNumber: null,
      position: "Bodega",
      salary: 700,
      frequency: "QUINCENAL",
      hireDate: "2025-03-01",
      vacationSince: null,
      active: true,
    });
    return { owner, ana, today };
  }

  it("crea la planilla, descuenta el adelanto, paga y genera el gasto y los asientos", async () => {
    const { owner, ana, today } = await setup();
    const session = await openCashSession(owner, { openingAmount: 200, notes: null });
    await createAdvance(owner, { employeeId: ana.id, amount: 40, method: "CASH", notes: null });

    const run = await createPayrollRun(owner, { frequency: "QUINCENAL", date: today });
    expect(run.lines).toHaveLength(2);
    const anaLine = run.lines.find((l) => l.employeeId === ana.id)!;
    expect(anaLine.advances.toNumber()).toBe(40);
    await expect(createPayrollRun(owner, { frequency: "QUINCENAL", date: today })).rejects.toThrow(/Ya existe/);

    const updated = await updatePayrollLine(owner, anaLine.id, { overtimeHours: 4, otherDeduction: 0 });
    const withOvertime = updated.lines.find((l) => l.employeeId === ana.id)!;
    // 900 ÷ 208 × 1.25 × 4 h
    expect(withOvertime.overtime.toNumber()).toBe(21.63);
    expect(updated.net.toNumber()).toBe(updated.lines.reduce((a, l) => a + l.net.toNumber(), 0));

    const paid = await payPayrollRun(owner, run.id, "CASH");
    expect(paid.status).toBe("PAID");
    const expense = await prisma.expense.findUniqueOrThrow({ where: { payrollRunId: run.id } });
    expect(expense.amount.toNumber()).toBe(
      Math.round((paid.gross.toNumber() + paid.employerCost.toNumber()) * 100) / 100
    );
    // El adelanto y el neto salieron de la caja.
    const cash = await cashSessionSummary(prisma, session.id);
    expect(cash.expected.toNumber()).toBe(Math.round((200 - 40 - paid.net.toNumber()) * 100) / 100);
    await expect(payPayrollRun(owner, run.id, "CASH")).rejects.toThrow(/ya se pagó/);
    await expect(deletePayrollRun(owner, run.id)).rejects.toThrow(/ya se pagó/);

    // Contabilidad: cuotas e ISR por pagar hasta que se pagan; el balance cuadra.
    const month = dayKey(new Date(), TZ).slice(0, 7);
    const { fromKey, toKey } = monthKeys(month);
    let statements = await financialStatements({ id: owner.businessId, timezone: TZ }, fromKey, toKey);
    expect(statements.balance.balanced).toBe(true);
    const liability = (code: string) =>
      statements.balance.liabilities.find((l) => l.code === code)?.amount.toNumber() ?? 0;
    expect(liability(ACCOUNTS.CSS_PAYABLE.code)).toBeGreaterThan(0);
    expect(statements.income.expenses.map((e) => e.code)).toEqual(
      expect.arrayContaining([ACCOUNTS.SALARIES.code, ACCOUNTS.EMPLOYER_CONTRIBUTIONS.code])
    );
    expect(statements.balance.assets.find((a) => a.code === ACCOUNTS.ADVANCES.code)).toBeUndefined();

    await payPayrollContributions(owner, run.id);
    statements = await financialStatements({ id: owner.businessId, timezone: TZ }, fromKey, toKey);
    expect(liability(ACCOUNTS.CSS_PAYABLE.code)).toBe(0);
    expect(liability(ACCOUNTS.ISR_WITHHELD.code)).toBe(0);
    expect(statements.balance.balanced).toBe(true);

    const employees = await listEmployees(owner.businessId);
    expect(employees.find((e) => e.id === ana.id)?.pendingAdvances.toNumber()).toBe(0);
    expect(employees[0].accruals.vacationDays.toNumber()).toBeGreaterThan(0);
  });

  it("borrar una planilla en borrador libera los adelantos", async () => {
    const { owner, ana, today } = await setup();
    await createAdvance(owner, { employeeId: ana.id, amount: 25, method: "TRANSFER", notes: null });
    const run = await createPayrollRun(owner, { frequency: "QUINCENAL", date: today });
    await deletePayrollRun(owner, run.id);
    const employees = await listEmployees(owner.businessId);
    expect(employees.find((e) => e.id === ana.id)?.pendingAdvances.toNumber()).toBe(25);
  });

  it("alimenta el flujo de caja y el punto de equilibrio", async () => {
    const { owner, today } = await setup();
    const projection = await cashflowProjection({ id: owner.businessId, timezone: TZ }, { days: 30, opening: 0 });
    const payroll = projection.weeks.reduce((a, w) => a + w.payroll.toNumber(), 0);
    expect(payroll).toBeGreaterThan(0);

    // Pagar la planilla de esta quincena la quita de la proyección.
    const run = await createPayrollRun(owner, { frequency: "QUINCENAL", date: today });
    await payPayrollRun(owner, run.id, "TRANSFER");
    const after = await cashflowProjection({ id: owner.businessId, timezone: TZ }, { days: 30, opening: 0 });
    const afterPayroll = after.weeks.reduce((a, w) => a + w.payroll.toNumber(), 0);
    const period = payPeriod(today, "QUINCENAL");
    if (period.end <= projection.to) expect(afterPayroll).toBeLessThan(payroll);

    const business = await prisma.business.findUniqueOrThrow({ where: { id: owner.businessId } });
    const result = await breakEven(business);
    expect(result.payroll.toNumber()).toBe(Math.round(1600 * (1 + 0.1225 + 0.015 + 0.0098) * 100) / 100);
  });

  it("no se paga una planilla en un mes cerrado", async () => {
    const { owner, today } = await setup();
    const run = await createPayrollRun(owner, { frequency: "QUINCENAL", date: today });
    await closePeriod({ ...owner, timezone: TZ }, today.slice(0, 7));
    await expect(payPayrollRun(owner, run.id, "TRANSFER")).rejects.toThrow(/está cerrado/);
  });
});
