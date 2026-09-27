import { describe, expect, it } from "vitest";
import {
  PAYROLL_DEFAULTS,
  accruals,
  annualIncomeTax,
  computeLine,
  payDates,
  payPeriod,
  payrollSettings,
  thirteenthAmount,
  thirteenthWindow,
} from "@/lib/payroll";

const s = PAYROLL_DEFAULTS;

describe("planilla de Panamá", () => {
  it("ISR anual por tramos", () => {
    expect(annualIncomeTax(11000, s).toNumber()).toBe(0);
    expect(annualIncomeTax(13000, s).toNumber()).toBe(300);
    expect(annualIncomeTax(60000, s).toNumber()).toBe(5850 + 2500);
  });

  it("periodos y días de pago", () => {
    expect(payPeriod("2026-02-20", "QUINCENAL")).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(payPeriod("2026-02-03", "MENSUAL")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(payDates("2026-01-10", "2026-02-20", "QUINCENAL")).toEqual(["2026-01-15", "2026-01-31", "2026-02-15"]);
  });

  it("el décimo tercer mes se paga en tres partidas", () => {
    expect(thirteenthWindow("2026-04-01", "2026-04-15")).toEqual({
      pay: "2026-04-15",
      start: "2025-12-16",
      end: "2026-04-15",
    });
    expect(thirteenthWindow("2026-04-16", "2026-04-30")).toBeNull();
    expect(thirteenthWindow("2026-12-01", "2026-12-31")?.pay).toBe("2026-12-15");
    // 1/12 de lo devengado en los cuatro meses: 1000 × 4 ÷ 12.
    expect(thirteenthAmount(1000, { start: "2025-12-16", end: "2026-04-15" }, "2020-01-01").toNumber()).toBe(333.33);
    // Entró a mitad de la partida: trabajó 61 de sus 121 días.
    expect(thirteenthAmount(1000, { start: "2025-12-16", end: "2026-04-15" }, "2026-02-14").toNumber()).toBe(
      Math.round(((1000 * 4) / 12) * (61 / 121) * 100) / 100
    );
  });

  it("quincena con décimo: CSS, seguro educativo, ISR y cuotas patronales", () => {
    const line = computeLine(
      { salary: 1000, frequency: "QUINCENAL", hireKey: "2020-01-01", advances: 50 },
      { start: "2026-04-01", end: "2026-04-15" },
      s
    );
    expect(line.salary.toNumber()).toBe(500);
    expect(line.thirteenth.toNumber()).toBe(333.33);
    expect(line.gross.toNumber()).toBe(833.33);
    expect(line.cssEmployee.toNumber()).toBe(72.92);
    expect(line.eduEmployee.toNumber()).toBe(6.25);
    expect(line.incomeTax.toNumber()).toBe(19.23);
    expect(line.net.toNumber()).toBe(684.93);
    expect(line.cssEmployer.toNumber()).toBe(97.08);
    expect(line.eduEmployer.toNumber()).toBe(7.5);
    expect(line.riskEmployer.toNumber()).toBe(8.17);
  });

  it("horas extra con recargo y salario proporcional al ingreso", () => {
    const line = computeLine(
      { salary: 832, frequency: "MENSUAL", hireKey: "2026-06-16", overtimeHours: 10 },
      { start: "2026-06-01", end: "2026-06-30" },
      s
    );
    // 832 ÷ 208 h = 4 por hora × 1.25 × 10 h.
    expect(line.overtime.toNumber()).toBe(50);
    expect(line.salary.toNumber()).toBe(416);
  });

  it("vacaciones y prima de antigüedad acumuladas", () => {
    const a = accruals(1100, "2025-01-01", null, "2026-01-01");
    expect(a.vacationDays.toNumber()).toBeCloseTo(32.7, 0);
    expect(a.seniorityAmount.toNumber()).toBeCloseTo((1100 * 12) / 52, 0);
  });

  it("los parámetros del negocio reemplazan los valores por defecto", () => {
    expect(payrollSettings({ cssEmployer: 0.1325, riskEmployer: "x" })).toMatchObject({
      cssEmployer: 0.1325,
      riskEmployer: s.riskEmployer,
    });
  });
});
