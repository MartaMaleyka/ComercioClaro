# Cuentas por pagar a proveedores

Prioridad 2 de la investigación. El minisúper y la abarrotería compran a crédito: la distribuidora deja la mercancía y cobra a los 15 o 30 días. Sin control, las facturas vencen sin que el dueño lo note y el efectivo de la caja se mezcla con los pagos.

## Qué hace

- **Compra a crédito.** En *Nueva compra* y al *recibir una orden de compra* hay tres formas de pago:
  - De contado (banco u otro medio).
  - Con dinero de la caja (sale del corte, como antes).
  - A crédito: crea una cuenta por pagar con número de factura y vencimiento.
- **Vencimiento.** Si no se indica, la factura vence según los *días de crédito* del proveedor (30 por defecto), que se configuran en su ficha.
- **Factura registrada a mano** (*Compras → Por pagar → Registrar factura*): para deudas que no vienen de una compra del sistema (servicios, mercancía anterior). Se puede cancelar mientras no tenga abonos.
- **Abonos.** Cada abono lleva monto, forma de pago y referencia.
  - En efectivo puede salir de la caja: exige una caja abierta y se resta del efectivo esperado del corte (`cashSessionSummary`, renglón "Abonos a proveedores").
  - Transferencia, tarjeta o Yappy salen del banco y no tocan la caja.
  - Un abono se puede anular: el saldo vuelve a la factura. Si el efectivo salió de un turno ya cerrado, regresa a la caja abierta como entrada.
- **Antigüedad de saldos:** al corriente, 1-30, 31-60 y más de 60 días de atraso.
- **Seguimiento:**
  - La pestaña *Por pagar* muestra el total, lo vencido y lo que vence esta semana.
  - El tablero tiene la tarjeta *Por pagar a proveedores*, con lo vencido y lo que vence en 7 días.
  - Las alertas diarias por correo (`/api/cron/low-stock`) incluyen lo vencido y lo que vence en los próximos 3 días.
- **Estado de cuenta por proveedor:** facturas y abonos en orden, con saldo acumulado.
- **Cancelar una compra a crédito** cancela su factura. Si ya tiene abonos, primero hay que anularlos.

## Impuesto de las compras (crédito fiscal)

Cada compra guarda el ITBMS (o IVA) que incluye, en `Purchase.tax`:

- Por defecto se calcula con la tasa de cada producto, suponiendo que el costo incluye el impuesto: `subtotal × tasa ÷ (1 + tasa)`.
- En una compra a crédito se puede escribir el impuesto de la factura del proveedor.
- La migración calcula el impuesto de las compras anteriores con la misma regla.
- La factura por pagar guarda el mismo monto (`SupplierBill.tax`). La contabilidad (prioridad 5) lo usa como crédito fiscal.

## Datos

| Modelo | Para qué |
| --- | --- |
| `SupplierBill` | Factura por pagar: proveedor, número, fecha, vencimiento, total, impuesto, saldo y estado (abierta, pagada, cancelada). Enlazada a la compra si viene de una. |
| `SupplierPayment` | Abono: monto, forma de pago, si salió de la caja (y de qué turno), referencia y anulación. |
| `Supplier.creditDays` | Días de crédito del proveedor. |
| `Purchase.onCredit`, `Purchase.tax` | Compra a crédito e impuesto incluido. |

Migración `20260930020000_cuentas_por_pagar`. Solo agrega columnas y tablas, más el cálculo del impuesto de las compras anteriores.

Las fechas de la factura y del vencimiento son días calendario. El atraso se calcula contra "hoy" en la zona horaria del negocio.

## Plan

Es una función básica, disponible en todos los planes.

## Pruebas

- Integración (`tests/integration/cuentas-por-pagar.test.ts`):
  - La compra a crédito crea la factura con su ITBMS y vencimiento.
  - Los abonos en efectivo salen de la caja y se pueden anular.
  - Antigüedad de saldos, lo vencido, lo que vence esta semana y el tablero.
  - Estado de cuenta con saldo acumulado.
  - Cancelar una compra a crédito, con y sin abonos.
  - Recibir una orden de compra a crédito.
- De punta a punta (`e2e/cuentas-por-pagar.spec.ts`):
  - Abono por banco y estado de cuenta.
  - Compra a crédito desde la pantalla, que después aparece en el tablero.
  - Revisión con axe, en modo claro y oscuro, de la pestaña, del abono, del estado de cuenta y del registro de factura.
