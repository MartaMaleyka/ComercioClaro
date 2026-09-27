# Contabilidad automática

Prioridad 5 de la investigación. El dueño de un comercio pequeño no lleva libros: le entrega al contador una bolsa de facturas cada mes. ComercioClaro ya registra todo lo que mueve dinero, así que la contabilidad puede salir sola.

## Cómo funciona

Los asientos **se derivan al consultar** (`buildJournal` en `src/server/accounting.ts`) de lo que ya está registrado. No hay doble captura ni tabla de asientos que se pueda desincronizar. Cada asiento cuadra (debe = haber); los centavos de redondeo se ajustan contra la cuenta de resultados del asiento.

### Plan de cuentas base

| Código | Cuenta | Tipo |
| --- | --- | --- |
| 1101 | Caja | Activo |
| 1102 | Bancos (tarjeta, transferencia, Yappy) | Activo |
| 1103 | Cuentas por cobrar (fiado) | Activo |
| 1104 | Inventario | Activo |
| 1105 | ITBMS crédito fiscal | Activo |
| 1190 | Traspasos entre sucursales | Activo |
| 1199 | Movimientos de caja por clasificar | Activo |
| 2101 | Cuentas por pagar (proveedores) | Pasivo |
| 2102 | ITBMS por pagar | Pasivo |
| 2103 | Vales por canjear | Pasivo |
| 2104 | Cobros por cuenta de terceros (recargas y servicios) | Pasivo |
| 3101 | Capital | Patrimonio |
| 3102 | Retiros del dueño | Patrimonio |
| 4101 | Ventas | Ingreso |
| 4103 | Otros ingresos (comisiones, vales vencidos) | Ingreso |
| 5101 | Costo de ventas | Gasto |
| 6180 | Mermas y ajustes de inventario | Gasto |
| 6190 | Faltantes y sobrantes de caja | Gasto |
| 61-… | Gastos por categoría (61-renta, 61-luz…) | Gasto |

### De dónde sale cada asiento

| Operación | Debe | Haber |
| --- | --- | --- |
| Venta | Caja, Bancos, Cuentas por cobrar o Vales (cada forma de pago por su parte) | Ventas (sin ITBMS) e ITBMS por pagar |
| Cancelación de venta | Ventas e ITBMS por pagar (lo no devuelto) | Cada forma de pago por lo que queda |
| Devolución | Ventas e ITBMS por pagar | La forma de reembolso |
| Movimiento de inventario (venta, cancelación, devolución, ajuste, existencia inicial, traspaso) | Inventario (o su contrapartida) | Costo de ventas, Mermas, Capital o Traspasos |
| Compra | Inventario (sin ITBMS) e ITBMS crédito fiscal | Caja, Bancos o Cuentas por pagar |
| Abono de fiado | Caja o Bancos | Cuentas por cobrar |
| Pago a proveedor | Cuentas por pagar | Caja (si salió de la caja) o Bancos |
| Gasto | Gasto de su categoría | Caja o Bancos |
| Venta de vale | Caja o Bancos | Vales por canjear |
| Recarga o servicio | Caja o Bancos | Cobros por cuenta de terceros y Otros ingresos (la comisión) |
| Aporte / retiro del dueño | Caja o Bancos / Retiros | Capital / Caja o Bancos |
| Fondo de caja y diferencia del corte | Caja | Movimientos por clasificar / Faltantes y sobrantes |

Las cancelaciones y anulaciones se registran como un asiento de reversa en su fecha, así que un mes ya revisado no cambia.

Los movimientos de caja que genera el sistema (cancelaciones, anulaciones y los del dueño) ya salen de su operación. Se marcan con `CashMovement.source` y el libro no los cuenta dos veces. La migración los marca también en los datos existentes.

### Inventario sin ITBMS

El ITBMS (o IVA) de las compras es crédito fiscal. Por eso:

- El inventario y el costo de ventas se valoran a costo ÷ (1 + tasa del producto).
- El costo de ventas contable puede ser menor que el de *Reportes*, que usa el costo con impuesto.

Con productos exentos (0%) no hay diferencia.

## Estados financieros y libros

En *Contabilidad* (menú del dueño), por mes:

- **Estado de resultados:** ventas, costo de ventas, utilidad bruta, otros ingresos, gastos por cuenta y utilidad neta.
- **Balance general:** activo, pasivo y patrimonio. El resultado acumulado se suma al patrimonio. Indica si cuadra (activo = pasivo + patrimonio).
- **Flujo de efectivo** (método directo): cambio de Caja y Bancos por origen. Operación (ventas, cobros, compras, gastos, pagos…) y financiamiento (aportes y retiros).
- **Libro diario y libro mayor** en pantalla. Se exportan:
  - En CSV.
  - En Excel: un archivo `.xls` en formato XML de Excel 2003, que abre en Excel, LibreOffice y Google Sheets sin librerías adicionales, con una hoja para cada libro.

## Aportes y retiros del dueño

`OwnerTransaction` separa el dinero personal del negocio:

- Lo que el dueño pone es aporte a capital. Lo que se lleva es un retiro, no un gasto.
- En efectivo entra o sale de la caja abierta (movimiento de caja con `source = OWNER`).

## Impuestos

El reporte de impuestos del mes (*Reportes → Impuestos*) muestra:

- El ITBMS de las ventas.
- El **crédito fiscal**: el ITBMS de las compras del mes (prioridad 2) y de las facturas registradas a mano.
- El **ITBMS a pagar neto**. Si queda negativo, es saldo a favor.

## Cierre de mes

`AccountingPeriod` guarda el mes cerrado (`closedAt`):

- **Qué bloquea:** registrar, cancelar o editar ventas, compras, gastos, facturas de proveedor, y aportes o retiros con fecha en un mes cerrado. También devolver o comprar mientras el mes en curso esté cerrado.
- **Ventas sin conexión** con fecha en un mes ya cerrado: se registran con la fecha de hoy en lugar de perderse.
- **Reabrir:** el dueño puede reabrir un mes. Queda en la bitácora del negocio con el motivo.

## Plan

Función `accounting` ("Contabilidad automática"), incluida en el plan Empresarial.

## Límites conocidos

- Las recargas y servicios quedan como deuda con el proveedor; la liquidación con el proveedor no se registra todavía.
- Los movimientos de caja registrados a mano y el fondo de cada turno van a "Movimientos de caja por clasificar". Para separar el dinero del dueño se usan los aportes y retiros.
- Una compra a crédito con un ITBMS escrito a mano distinto al calculado deja una diferencia de centavos entre el inventario contable y la valuación del inventario.

## Pruebas

- Integración (`tests/integration/contabilidad.test.ts`):
  - Un mes con ventas en efectivo, con tarjeta, con pago dividido con fiado y con vale.
  - Devolución y cancelación.
  - Compra a crédito y compra de contado, con abonos y un abono anulado.
  - Abono de fiado, recarga, merma, gasto, movimiento de caja, aporte, retiro y un corte con faltante.
  - Comprueba:
    - Cada asiento cuadra.
    - **Activo = pasivo + patrimonio.**
    - El fiado, lo que se debe a proveedores, vales y terceros coinciden con los saldos del sistema.
    - El ITBMS por pagar es el del reporte de impuestos, y el crédito fiscal es el de la compra.
    - La Caja contable es igual al efectivo contado en el corte.
    - El flujo de efectivo termina en Caja + Bancos.
  - Libros y exportación.
  - Cierre, bloqueo y reapertura.
  - Venta sin conexión fechada en un mes cerrado.
  - Compra cancelada.
- De punta a punta (`e2e/contabilidad.spec.ts`):
  - El balance cuadra y el Excel se descarga.
  - Diario, mayor, retiro del dueño y cierre.
  - Revisión con axe de las cinco pestañas y del reporte de impuestos, en modo claro y oscuro.
