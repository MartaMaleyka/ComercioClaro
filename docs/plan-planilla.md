# Planilla panameña

Prioridad 6 de la investigación. Una fonda o un minisúper con dos o tres empleados calcula la quincena a mano: la CSS, el seguro educativo, el décimo y las vacaciones se hacen en una libreta o no se hacen.

> **Verifique los montos con su contador.** Los porcentajes y tramos son valores por defecto editables en *Configuración → Planilla*. Cambian con las reformas a la Caja de Seguro Social y a la ley del impuesto sobre la renta.

## Valores por defecto (`PAYROLL_DEFAULTS` en `src/lib/payroll.ts`)

| Concepto | Empleado | Patrono |
| --- | --- | --- |
| Cuota de la CSS sobre el salario | 9.75% | 12.25% |
| Seguro educativo | 1.25% | 1.50% |
| Riesgos profesionales (según la actividad) | — | 0.98% |
| CSS sobre el décimo tercer mes (sin seguro educativo) | 7.25% | 10.75% |

- **ISR anual por tramos:** exento hasta B/.11,000; 15% sobre el excedente hasta B/.50,000; B/.5,850 más 25% sobre el excedente de B/.50,000.
- **Retención:** tasa efectiva del ISR de 13 salarios (12 más el décimo), aplicada a lo devengado en cada pago.
- **Horas extra:** salario ÷ 208 horas al mes × 1.25 (25% de recargo) × horas.

## Qué hace

- **Empleados:**
  - Nombre, cédula, número de seguro social, puesto, salario mensual, pago quincenal o mensual, fecha de ingreso y últimas vacaciones.
  - Se pueden desactivar sin borrarlos.
- **Planilla del periodo** (quincena 1-15 y 16-fin, o mes):
  - Se crea para los empleados activos de esa forma de pago.
  - El salario es proporcional a lo trabajado si entró a mitad del periodo.
  - Se descuentan los adelantos pendientes.
  - En borrador se ajustan las horas extra y otros descuentos.
- **Décimo tercer mes:** 1/12 de lo devengado, en tres partidas: 15 de abril (16 dic - 15 abr), 15 de agosto (16 abr - 15 ago) y 15 de diciembre (16 ago - 15 dic). Se agrega sola a la planilla que incluye esa fecha, en proporción a lo trabajado en la partida.
- **Vacaciones acumuladas:** 30 días por cada 11 meses desde las últimas vacaciones (o desde el ingreso), con su valor.
- **Prima de antigüedad:** una semana de salario por cada año trabajado.
- **Adelantos de sueldo:**
  - Se entregan en efectivo (salen de la caja abierta), por transferencia o por Yappy.
  - Se descuentan en la siguiente planilla.
  - Si se borra la planilla en borrador, vuelven a quedar pendientes.
- **Comprobante de pago** por empleado (`/planilla/{id}/comprobantes`), listo para imprimir y firmar. Trae el devengado, cada descuento, el neto y las cuotas patronales.
- **Pagar la planilla:**
  - Genera el gasto "Sueldos": salarios más cuotas patronales, enlazado con `Expense.payrollRunId`.
  - Si se paga en efectivo, el neto sale de la caja abierta.
  - No se puede pagar en un mes cerrado.
- **Pago a la CSS y del ISR retenido:** se registra aparte, porque se paga el mes siguiente.

## Contabilidad y flujo de caja

- **Contabilidad (prioridad 5):** el pago de la planilla es un asiento detallado.
  - Debe: Sueldos y salarios (devengado) y Cuotas patronales.
  - Haber: Caja o Bancos (neto), Cuotas de la CSS por pagar, ISR retenido por pagar, Adelantos a empleados y Otros descuentos por pagar.
  - El gasto "Sueldos" no se cuenta dos veces.
  - Los adelantos son un activo hasta que se descuentan.
  - El pago a la CSS salda los pasivos contra Bancos.
- **Flujo de caja (prioridad 4):** cada día de pago (15 y fin de mes, o fin de mes) cuenta el costo del periodo de cada empleado activo (salario más cuotas patronales), más un tercio del salario en las partidas del décimo. Los periodos ya pagados no se cuentan.
- **Punto de equilibrio:** los gastos fijos incluyen la planilla mensual (salarios más cuotas patronales).

## Plan

Función `payroll` ("Planilla"), incluida en el plan Empresarial.

## Datos

| Modelo | Para qué |
| --- | --- |
| `Employee` | Datos del empleado y salario. |
| `PayrollRun` | Planilla de un periodo: estado, pago, cuotas pagadas y totales. |
| `PayrollLine` | Por empleado: salario, horas extra, décimo, devengado, CSS, seguro educativo, ISR, adelantos, otros descuentos, neto y cuotas patronales. |
| `SalaryAdvance` | Adelanto y la planilla en que se descontó. |
| `Business.payrollSettings` | Parámetros del negocio. |
| `Expense.payrollRunId` | Gasto generado por la planilla. |

Migración `20260930060000_planilla`. Solo agrega.

## Pruebas

- Unitarias (`tests/unit/planilla.test.ts`):
  - ISR por tramos.
  - Periodos y días de pago.
  - **Décimo tercer mes calculado**, completo y proporcional.
  - Quincena con décimo: CSS, seguro educativo, ISR y cuotas patronales.
  - Horas extra.
  - Vacaciones y prima de antigüedad.
  - Parámetros del negocio.
- Integración (`tests/integration/planilla.test.ts`):
  - Planilla con adelanto y horas extra, pago en efectivo desde la caja, gasto generado, asientos (el balance cuadra) y pago a la CSS.
  - Borrar un borrador libera los adelantos.
  - Flujo de caja y punto de equilibrio con la planilla.
  - Bloqueo en un mes cerrado.
- De punta a punta (`e2e/planilla.spec.ts`):
  - Empleado nuevo, planilla mensual con horas extra, comprobantes y pago.
  - Revisión con axe de empleados, planillas, el detalle y los parámetros en Configuración, en modo claro y oscuro.
