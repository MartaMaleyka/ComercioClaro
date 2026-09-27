# Flujo de caja proyectado y punto de equilibrio

Prioridad 4 de la investigación. El dueño sabe cuánto vendió, pero no si le alcanzará para la renta del 1 y la factura de la distribuidora del 15, ni cuánto tiene que vender al mes para no perder.

## Gastos recurrentes

- Se registran en *Gastos → Recurrentes*: categoría, monto, día del mes, forma de pago y si está activo.
- El cron diario (`/api/cron/low-stock`) registra el gasto del mes cuando llega su día:
  - Una sola vez por mes, aunque el cron corra varias veces.
  - El gasto queda marcado como "Recurrente".
  - Los días 29, 30 y 31 caen el último día en los meses más cortos.
- Si al crearlo su día de este mes ya pasó, empieza el mes siguiente (el de este mes probablemente ya se anotó a mano).
- Borrar un gasto recurrente no borra los gastos que ya registró.
- Los gastos generados por el cron no salen del efectivo de la caja: no tienen turno.

## Proyección a 30, 60 y 90 días

En *Reportes → Flujo y equilibrio*, semana a semana:

| Entradas | Cómo se calcula |
| --- | --- |
| Ventas | Promedio cobrado por día de la semana en las últimas 8 semanas. Lee `SalePayment`, sin la parte fiada ni la pagada con vale, porque esas no entran como dinero. |
| Cobros de fiado | Lo pendiente de cada venta fiada en su fecha de vencimiento (antigüedad FIFO). Lo vencido se cuenta en la primera semana. |

| Salidas | Cómo se calcula |
| --- | --- |
| Por pagar | Saldo de cada factura de proveedor (prioridad 2) en su vencimiento. Lo vencido se cuenta en la primera semana. |
| Gastos fijos | Cada gasto recurrente en las fechas que le tocan. No cuenta el de este mes si ya se registró. |
| Compras | Promedio diario de las compras de contado de las últimas 8 semanas (las compras a crédito ya están en "Por pagar"). |
| Planilla | Sueldos estimados. Queda en cero hasta la prioridad 6. |

- **Saldo inicial:** el que escriba el dueño (caja más banco) o, si no escribe nada, el efectivo esperado de la caja abierta.
- **Alerta:** si el saldo de alguna semana baja de cero, se avisa en qué semana y se sugiere adelantar cobros o negociar fechas.

## Punto de equilibrio

- **Margen de contribución** = (ventas − costo real de lo vendido − comisiones de medios de pago) ÷ ventas, de los últimos 90 días.
- **Gastos fijos del mes** = gastos recurrentes activos más la planilla. Sin gastos recurrentes se usa el promedio mensual de los gastos de los últimos 90 días, y se sugiere registrarlos.
- **Ventas para no perder** = gastos fijos ÷ margen de contribución.
- **En días:** cuántos días hacen falta al ritmo de venta diario promedio. Si son más de los que tiene el mes, se avisa.
- **Avance del mes:** lo vendido este mes contra el punto de equilibrio, con una barra de progreso accesible (`role="progressbar"`).

## Plan

Función `cashflow` ("Flujo de caja y punto de equilibrio"). Está incluida en Pro y Empresarial, y el seed la agrega a esos planes aunque ya existan. El cron registra los gastos recurrentes de todos los negocios: si un negocio pierde la función, sus gastos fijos siguen anotándose.

## Datos

| Modelo | Para qué |
| --- | --- |
| `RecurringExpense` | Categoría, monto, día del mes, forma de pago, activo y último mes registrado. |
| `Expense.recurringId` | Gasto generado por un gasto recurrente. |

Migración `20260930040000_flujo_equilibrio`. Solo agrega.

## Pruebas

- Integración (`tests/integration/flujo-equilibrio.test.ts`):
  - Fechas de los gastos recurrentes (el 31 en febrero, cruce de año).
  - El gasto del mes se registra una sola vez.
  - Proyección semana a semana: ventas por día de la semana, fiado, facturas y alerta de saldo negativo.
  - Gastos recurrentes en sus fechas.
  - Punto de equilibrio con gastos recurrentes y con el promedio de gastos.
- De punta a punta (`e2e/flujo-equilibrio.spec.ts`):
  - Proyección a 30 y 90 días con la alerta.
  - Alta y baja de un gasto recurrente.
  - Revisión con axe del reporte, de la pestaña y del formulario, en modo claro y oscuro.

## Robustez de las pruebas de punta a punta

Playwright corre dos archivos a la vez, así que las pruebas no deben depender de datos que otra puede cambiar al mismo tiempo:

- `admin.spec.ts` espera la respuesta del segundo guardado de funciones. Antes esperaba un aviso que podía seguir en pantalla desde el primer guardado.
- `recetas.spec.ts` verifica el movimiento del kárdex de su propia venta. Antes comparaba existencias, que otra prueba de la fonda puede mover.
