/**
 * Cálculos de planilla de Panamá. Los porcentajes son valores por defecto editables en
 * Configuración → Planilla: VERIFÍQUELOS CON SU CONTADOR, cambian con las reformas a la CSS.
 */
import { D, money, sum, type Decimal, type DecimalLike } from "./decimal";
import { addDays, dayKeysBetween, parseDayKey } from "./dates";

export interface PayrollSettings {
  /** Cuota obrera de la CSS sobre el salario */
  cssEmployee: number;
  /** Cuota patronal de la CSS sobre el salario */
  cssEmployer: number;
  /** Seguro educativo del empleado y del patrono */
  eduEmployee: number;
  eduEmployer: number;
  /** Riesgos profesionales (patrono), según la actividad */
  riskEmployer: number;
  /** CSS sobre el décimo tercer mes (sin seguro educativo) */
  thirteenthCssEmployee: number;
  thirteenthCssEmployer: number;
  /** ISR anual: exento hasta, tramo intermedio hasta, y sus tasas */
  isrExempt: number;
  isrMiddleLimit: number;
  isrMiddleRate: number;
  isrTopRate: number;
  /** Recargo de horas extra (1.25 = 25% más) y horas al mes para el valor de la hora */
  overtimeFactor: number;
  monthlyHours: number;
}

export const PAYROLL_DEFAULTS: PayrollSettings = {
  cssEmployee: 0.0975,
  cssEmployer: 0.1225,
  eduEmployee: 0.0125,
  eduEmployer: 0.015,
  riskEmployer: 0.0098,
  thirteenthCssEmployee: 0.0725,
  thirteenthCssEmployer: 0.1075,
  isrExempt: 11000,
  isrMiddleLimit: 50000,
  isrMiddleRate: 0.15,
  isrTopRate: 0.25,
  overtimeFactor: 1.25,
  monthlyHours: 208,
};

/** Parámetros del negocio sobre los valores por defecto (ignora lo que no sea número). */
export function payrollSettings(value: unknown): PayrollSettings {
  const result = { ...PAYROLL_DEFAULTS };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(PAYROLL_DEFAULTS) as (keyof PayrollSettings)[]) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) result[key] = v;
    }
  }
  return result;
}

/** Impuesto sobre la renta anual por tramos. */
export function annualIncomeTax(annual: DecimalLike, s: PayrollSettings) {
  const income = D(annual);
  if (income.lte(s.isrExempt)) return D(0);
  const middle = minOf(income, D(s.isrMiddleLimit)).minus(s.isrExempt).times(s.isrMiddleRate);
  const top = income.gt(s.isrMiddleLimit) ? income.minus(s.isrMiddleLimit).times(s.isrTopRate) : D(0);
  return money(middle.plus(top));
}

function minOf(a: Decimal, b: Decimal) {
  return a.lt(b) ? a : b;
}

/**
 * Tasa efectiva de retención: el ISR anual de 13 salarios (12 más el décimo) entre ese ingreso.
 * Se aplica igual al salario y al décimo.
 */
export function withholdingRate(monthlySalary: DecimalLike, s: PayrollSettings) {
  const annual = D(monthlySalary).times(13);
  return annual.gt(0) ? annualIncomeTax(annual, s).div(annual) : D(0);
}

export type Frequency = "QUINCENAL" | "MENSUAL";

/** Periodo que contiene la fecha: quincena (1-15 y 16-fin) o mes. */
export function payPeriod(dayKey: string, frequency: Frequency) {
  const { year, month, day } = parseDayKey(dayKey);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${pad(month)}`;
  if (frequency === "MENSUAL") return { start: `${prefix}-01`, end: `${prefix}-${pad(last)}` };
  return day <= 15
    ? { start: `${prefix}-01`, end: `${prefix}-15` }
    : { start: `${prefix}-16`, end: `${prefix}-${pad(last)}` };
}

/** Días de pago entre dos fechas: el 15 y el último día (quincenal) o el último día (mensual). */
export function payDates(fromKey: string, toKey: string, frequency: Frequency) {
  const dates = new Set<string>();
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) {
    const end = payPeriod(k, frequency).end;
    if (end >= fromKey && end <= toKey) dates.add(end);
  }
  return [...dates].sort();
}

/**
 * Partidas del décimo tercer mes (1/12 de lo devengado): 15 de abril (16 dic-15 abr),
 * 15 de agosto (16 abr-15 ago) y 15 de diciembre (16 ago-15 dic).
 * Devuelve la partida que se paga dentro del periodo, si hay una.
 */
export function thirteenthWindow(periodStart: string, periodEnd: string) {
  const year = Number(periodEnd.slice(0, 4));
  const candidates = [
    { pay: `${year}-04-15`, start: `${year - 1}-12-16`, end: `${year}-04-15` },
    { pay: `${year}-08-15`, start: `${year}-04-16`, end: `${year}-08-15` },
    { pay: `${year}-12-15`, start: `${year}-08-16`, end: `${year}-12-15` },
  ];
  return candidates.find((c) => c.pay >= periodStart && c.pay <= periodEnd) ?? null;
}

/** Fracción de un rango de días en que el empleado ya trabajaba (por su fecha de ingreso). */
export function workedShare(fromKey: string, toKey: string, hireKey: string) {
  const total = dayKeysBetween(fromKey, toKey).length;
  if (hireKey <= fromKey) return D(1);
  if (hireKey > toKey) return D(0);
  return D(dayKeysBetween(hireKey, toKey).length).div(total);
}

/** Décimo: salario mensual × 4 meses de la partida ÷ 12, en proporción a lo trabajado. */
export function thirteenthAmount(monthlySalary: DecimalLike, window: { start: string; end: string }, hireKey: string) {
  return money(
    D(monthlySalary)
      .times(4)
      .div(12)
      .times(workedShare(window.start, window.end, hireKey))
  );
}

export interface LineInput {
  salary: DecimalLike;
  frequency: Frequency;
  hireKey: string;
  overtimeHours?: DecimalLike;
  advances?: DecimalLike;
  otherDeduction?: DecimalLike;
}

/** Cálculo de un renglón de planilla. */
export function computeLine(input: LineInput, period: { start: string; end: string }, s: PayrollSettings) {
  const monthly = D(input.salary);
  const base = input.frequency === "QUINCENAL" ? monthly.div(2) : monthly;
  const salary = money(base.times(workedShare(period.start, period.end, input.hireKey)));
  const hours = D(input.overtimeHours ?? 0);
  const overtime = money(monthly.div(s.monthlyHours).times(s.overtimeFactor).times(hours));
  const window = thirteenthWindow(period.start, period.end);
  const thirteenth = window ? thirteenthAmount(monthly, window, input.hireKey) : D(0);
  const ordinary = salary.plus(overtime);
  const gross = money(ordinary.plus(thirteenth));
  const cssEmployee = money(ordinary.times(s.cssEmployee).plus(thirteenth.times(s.thirteenthCssEmployee)));
  const eduEmployee = money(ordinary.times(s.eduEmployee));
  const incomeTax = money(gross.times(withholdingRate(monthly, s)));
  const advances = money(input.advances ?? 0);
  const otherDeduction = money(input.otherDeduction ?? 0);
  const deductions = sum([cssEmployee, eduEmployee, incomeTax, advances, otherDeduction]);
  return {
    salary,
    overtimeHours: hours,
    overtime,
    thirteenth,
    gross,
    cssEmployee,
    eduEmployee,
    incomeTax,
    advances,
    otherDeduction,
    net: money(gross.minus(deductions)),
    cssEmployer: money(ordinary.times(s.cssEmployer).plus(thirteenth.times(s.thirteenthCssEmployer))),
    eduEmployer: money(ordinary.times(s.eduEmployer)),
    riskEmployer: money(gross.times(s.riskEmployer)),
  };
}

/** Meses completos (con fracción) entre dos días. */
function monthsBetween(fromKey: string, toKey: string) {
  if (toKey <= fromKey) return D(0);
  return D(dayKeysBetween(fromKey, toKey).length - 1).div(D(365).div(12));
}

/**
 * Prestaciones acumuladas a una fecha:
 * - Vacaciones: 30 días por cada 11 meses trabajados desde las últimas vacaciones.
 * - Prima de antigüedad: una semana de salario por cada año trabajado.
 */
export function accruals(
  monthlySalary: DecimalLike,
  hireKey: string,
  vacationSinceKey: string | null,
  todayKey: string
) {
  const salary = D(monthlySalary);
  const vacationMonths = monthsBetween(vacationSinceKey ?? hireKey, todayKey);
  const vacationDays = vacationMonths.times(30).div(11).toDecimalPlaces(1);
  const years = monthsBetween(hireKey, todayKey).div(12);
  return {
    vacationDays,
    vacationAmount: money(salary.div(30).times(vacationDays)),
    years: years.toDecimalPlaces(2),
    seniorityAmount: money(salary.times(12).div(52).times(years)),
  };
}
