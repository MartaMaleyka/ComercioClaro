import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { AppError, notFound } from "@/lib/errors";
import { D, money, sum } from "@/lib/decimal";
import { prisma, type Tx } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { dayKey } from "@/lib/dates";
import { accruals, computeLine, payPeriod, payrollSettings, type Frequency } from "@/lib/payroll";
import type { Actor } from "./inventory";
import { getOpenSession } from "./cash";
import { assertOpenPeriod } from "./accounting";

export interface EmployeeInput {
  name: string;
  idNumber: string | null;
  socialSecurityNumber: string | null;
  position: string | null;
  salary: number;
  frequency: Frequency;
  hireDate: string;
  vacationSince: string | null;
  active: boolean;
}

const calendarDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const keyOf = (date: Date) => date.toISOString().slice(0, 10);

async function settingsOf(db: Tx | typeof prisma, businessId: string) {
  const business = await db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { payrollSettings: true, timezone: true },
  });
  return { settings: payrollSettings(business.payrollSettings), timezone: business.timezone };
}

// ---------- Empleados ----------

export async function listEmployees(businessId: string) {
  const [employees, { timezone }] = await Promise.all([
    prisma.employee.findMany({
      where: { businessId },
      include: { advances: { where: { runId: null } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    settingsOf(prisma, businessId),
  ]);
  const today = dayKey(new Date(), timezone);
  return employees.map((e) => ({
    ...e,
    pendingAdvances: money(sum(e.advances.map((a) => a.amount))),
    accruals: accruals(e.salary, keyOf(e.hireDate), e.vacationSince ? keyOf(e.vacationSince) : null, today),
  }));
}

function employeeData(input: EmployeeInput) {
  return {
    name: input.name,
    idNumber: input.idNumber,
    socialSecurityNumber: input.socialSecurityNumber,
    position: input.position,
    salary: money(input.salary),
    frequency: input.frequency,
    hireDate: calendarDay(input.hireDate),
    vacationSince: input.vacationSince ? calendarDay(input.vacationSince) : null,
    active: input.active,
    terminatedAt: input.active ? null : new Date(),
  };
}

export async function createEmployee(actor: Actor, input: EmployeeInput) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({ data: { ...employeeData(input), businessId: actor.businessId } });
    await audit(tx, actor, "employee.create", "Employee", employee.id, { name: input.name });
    return employee;
  });
}

export async function updateEmployee(actor: Actor, id: string, input: EmployeeInput) {
  const existing = await prisma.employee.findFirst({ where: { id, businessId: actor.businessId } });
  if (!existing) throw notFound("Empleado");
  return prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({
      where: { id },
      data: { ...employeeData(input), terminatedAt: input.active ? null : (existing.terminatedAt ?? new Date()) },
    });
    await audit(tx, actor, "employee.update", "Employee", id, { salary: input.salary, active: input.active });
    return employee;
  });
}

// ---------- Adelantos ----------

export async function createAdvance(
  actor: Actor,
  input: { employeeId: string; amount: number; method: "CASH" | "TRANSFER" | "YAPPY"; notes: string | null }
) {
  return prisma.$transaction(async (tx) => {
    await assertOpenPeriod(tx, actor.businessId, new Date());
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, businessId: actor.businessId, active: true },
    });
    if (!employee) throw notFound("Empleado");
    const amount = money(input.amount);
    const session = input.method === "CASH" ? await getOpenSession(tx, actor.businessId) : null;
    if (input.method === "CASH" && !session)
      throw new AppError(409, "Abre la caja para entregar el adelanto en efectivo");
    const advance = await tx.salaryAdvance.create({
      data: {
        amount,
        method: input.method,
        date: new Date(),
        notes: input.notes,
        employeeId: employee.id,
        cashSessionId: session?.id ?? null,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    if (session) {
      await tx.cashMovement.create({
        data: {
          type: "OUT",
          amount,
          reason: `Adelanto de sueldo a ${employee.name}`,
          source: "ADVANCE",
          cashSessionId: session.id,
          businessId: actor.businessId,
          userId: actor.userId,
        },
      });
    }
    await audit(tx, actor, "employee.advance", "Employee", employee.id, { amount: amount.toNumber() });
    return advance;
  });
}

// ---------- Planillas ----------

export const runInclude = {
  lines: { include: { employee: true }, orderBy: { employee: { name: "asc" } } },
} satisfies Prisma.PayrollRunInclude;

async function refreshTotals(tx: Tx, runId: string) {
  const lines = await tx.payrollLine.findMany({ where: { runId } });
  const gross = sum(lines.map((l) => l.gross));
  const net = sum(lines.map((l) => l.net));
  const employerCost = sum(lines.map((l) => D(l.cssEmployer).plus(l.eduEmployer).plus(l.riskEmployer)));
  await tx.payrollRun.update({
    where: { id: runId },
    data: {
      gross: money(gross),
      net: money(net),
      deductions: money(gross.minus(net)),
      employerCost: money(employerCost),
    },
  });
}

/**
 * Crea la planilla del periodo que contiene la fecha para los empleados activos de esa
 * frecuencia. Descuenta los adelantos pendientes y agrega la partida del décimo cuando toca.
 */
export async function createPayrollRun(actor: Actor, input: { frequency: Frequency; date: string }) {
  return prisma.$transaction(async (tx) => {
    const { settings } = await settingsOf(tx, actor.businessId);
    const period = payPeriod(input.date, input.frequency);
    const exists = await tx.payrollRun.findUnique({
      where: {
        businessId_frequency_periodStart: {
          businessId: actor.businessId,
          frequency: input.frequency,
          periodStart: period.start,
        },
      },
    });
    if (exists) throw new AppError(409, "Ya existe la planilla de ese periodo");
    const employees = await tx.employee.findMany({
      where: {
        businessId: actor.businessId,
        active: true,
        frequency: input.frequency,
        hireDate: { lte: calendarDay(period.end) },
      },
      include: { advances: { where: { runId: null, date: { lte: new Date(`${period.end}T23:59:59.999Z`) } } } },
    });
    if (employees.length === 0) throw new AppError(400, "No hay empleados activos con esa forma de pago");
    const run = await tx.payrollRun.create({
      data: {
        frequency: input.frequency,
        periodStart: period.start,
        periodEnd: period.end,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    for (const employee of employees) {
      const pending = sum(employee.advances.map((a) => a.amount));
      const line = computeLine(
        { salary: employee.salary, frequency: input.frequency, hireKey: keyOf(employee.hireDate), advances: pending },
        period,
        settings
      );
      await tx.payrollLine.create({ data: { ...line, runId: run.id, employeeId: employee.id } });
      if (employee.advances.length > 0) {
        await tx.salaryAdvance.updateMany({
          where: { id: { in: employee.advances.map((a) => a.id) } },
          data: { runId: run.id },
        });
      }
    }
    await refreshTotals(tx, run.id);
    await audit(tx, actor, "payroll.create", "PayrollRun", run.id, { period: `${period.start}..${period.end}` });
    return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

async function draftRun(tx: Tx, actor: Actor, runId: string) {
  const run = await tx.payrollRun.findFirst({ where: { id: runId, businessId: actor.businessId } });
  if (!run) throw notFound("Planilla");
  if (run.status !== "DRAFT") throw new AppError(409, "La planilla ya se pagó");
  return run;
}

/** Ajusta horas extra y otros descuentos de un renglón (planilla en borrador). */
export async function updatePayrollLine(
  actor: Actor,
  lineId: string,
  input: { overtimeHours: number; otherDeduction: number }
) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.payrollLine.findUnique({ where: { id: lineId }, include: { employee: true } });
    if (!line) throw notFound("Renglón de planilla");
    const run = await draftRun(tx, actor, line.runId);
    const { settings } = await settingsOf(tx, actor.businessId);
    const computed = computeLine(
      {
        salary: line.employee.salary,
        frequency: run.frequency,
        hireKey: keyOf(line.employee.hireDate),
        overtimeHours: input.overtimeHours,
        advances: line.advances,
        otherDeduction: input.otherDeduction,
      },
      { start: run.periodStart, end: run.periodEnd },
      settings
    );
    await tx.payrollLine.update({ where: { id: lineId }, data: computed });
    await refreshTotals(tx, run.id);
    return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

/** Borra una planilla en borrador: sus adelantos vuelven a quedar pendientes. */
export async function deletePayrollRun(actor: Actor, runId: string) {
  return prisma.$transaction(async (tx) => {
    await draftRun(tx, actor, runId);
    await tx.salaryAdvance.updateMany({ where: { runId }, data: { runId: null } });
    await tx.payrollRun.delete({ where: { id: runId } });
    await audit(tx, actor, "payroll.delete", "PayrollRun", runId);
  });
}

/**
 * Paga la planilla: registra el gasto (sueldos más cuotas patronales) y, si se paga en
 * efectivo, el neto sale de la caja abierta. Las cuotas y el ISR quedan por pagar.
 */
export async function payPayrollRun(actor: Actor, runId: string, method: PaymentMethod) {
  return prisma.$transaction(async (tx) => {
    const run = await draftRun(tx, actor, runId);
    const now = new Date();
    await assertOpenPeriod(tx, actor.businessId, now);
    const session = method === "CASH" ? await getOpenSession(tx, actor.businessId) : null;
    if (method === "CASH" && !session) throw new AppError(409, "Abre la caja para pagar en efectivo");
    const { count } = await tx.payrollRun.updateMany({
      where: { id: runId, status: "DRAFT" },
      data: { status: "PAID", paidAt: now, paidMethod: method },
    });
    if (count === 0) throw new AppError(409, "La planilla ya se pagó");
    await tx.expense.create({
      data: {
        category: "Sueldos",
        description: `Planilla ${run.periodStart} al ${run.periodEnd} (incluye cuotas patronales)`,
        amount: money(D(run.gross).plus(run.employerCost)),
        paymentMethod: method,
        date: now,
        payrollRunId: run.id,
        userId: actor.userId,
        businessId: actor.businessId,
      },
    });
    if (session) {
      await tx.cashMovement.create({
        data: {
          type: "OUT",
          amount: run.net,
          reason: `Planilla ${run.periodStart} al ${run.periodEnd}`,
          source: "PAYROLL",
          cashSessionId: session.id,
          businessId: actor.businessId,
          userId: actor.userId,
        },
      });
    }
    await audit(tx, actor, "payroll.pay", "PayrollRun", runId, { net: run.net.toNumber(), method });
    return tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: runInclude });
  });
}

/** Registra que ya se pagaron a la CSS y a la DGI las cuotas y el ISR retenido de la planilla. */
export async function payPayrollContributions(actor: Actor, runId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({ where: { id: runId, businessId: actor.businessId } });
    if (!run) throw notFound("Planilla");
    if (run.status !== "PAID") throw new AppError(409, "Primero paga la planilla");
    if (run.contributionsPaidAt) throw new AppError(409, "Las cuotas de esta planilla ya se pagaron");
    await tx.payrollRun.update({ where: { id: runId }, data: { contributionsPaidAt: new Date() } });
    await audit(tx, actor, "payroll.contributions", "PayrollRun", runId);
    return tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: runInclude });
  });
}

export async function listPayrollRuns(businessId: string) {
  return prisma.payrollRun.findMany({
    where: { businessId },
    include: runInclude,
    orderBy: { periodStart: "desc" },
    take: 48,
  });
}

export async function getPayrollRun(businessId: string, id: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id, businessId }, include: runInclude });
  if (!run) throw notFound("Planilla");
  return run;
}

/** Cuotas por pagar de una línea: CSS y seguro educativo (empleado y patrono) y riesgos profesionales. */
export function lineContributions(l: {
  cssEmployee: Prisma.Decimal;
  eduEmployee: Prisma.Decimal;
  cssEmployer: Prisma.Decimal;
  eduEmployer: Prisma.Decimal;
  riskEmployer: Prisma.Decimal;
}) {
  return D(l.cssEmployee).plus(l.eduEmployee).plus(l.cssEmployer).plus(l.eduEmployer).plus(l.riskEmployer);
}
