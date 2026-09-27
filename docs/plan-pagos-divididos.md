# Pagos divididos

Prioridad 3 de la investigación. En la caja es común que el cliente pague una parte con tarjeta o Yappy y el resto en efectivo, que use un vale que no alcanza, o que deje una parte fiada. Antes cada venta tenía una sola forma de pago.

## Qué hace

- **Punto de venta:**
  - El botón *Dividir pago* abre renglones de forma de pago y monto.
  - Se ve lo que falta por cubrir o el cambio, y se puede volver a *Un solo pago*.
  - En efectivo se escribe lo que entrega el cliente. El cambio sale solo de esa parte.
  - Tarjeta, transferencia y Yappy llevan su referencia. El vale lleva su código.
  - Sin conexión se puede cobrar dividido, salvo con vale (necesita validar el saldo en el servidor). El cobro automático de Yappy tampoco se usa en un pago dividido: se registra con su referencia.
- **Reglas en el servidor** (`resolvePayments` en `src/server/payments.ts`):
  - Lo que no es efectivo no puede pasar del total. El efectivo debe cubrir lo que falta; si no hay efectivo, las demás formas deben sumar exactamente el total.
  - Una sola vez cada forma de pago.
  - La parte fiada exige cliente y respeta su límite de crédito (solo con esa parte). Suma a su saldo con el vencimiento de su plazo.
  - La parte fiada no gana puntos de lealtad hasta pagarse.
  - La parte con vale descuenta del vale. El cobro de Yappy confirmado se valida contra su parte.
- **Datos:**
  - Cada venta guarda sus pagos en `SalePayment`: forma, monto aplicado y referencia.
  - `Sale.paymentMethod` es la forma única, o `MIXED` si son varias.
  - Una venta de una sola forma de pago funciona igual que antes (`paymentMethod` + `amountReceived`).
- **Devoluciones:** el cajero elige la forma de reembolso, con los límites de cada una:
  - Fiado: hasta lo fiado que queda.
  - Vale: hasta lo pagado con vale.
  - Dinero (efectivo, tarjeta, transferencia o Yappy): hasta lo cobrado en dinero. Una venta en efectivo se puede devolver por tarjeta, y al revés, como antes.
  - Las reglas anteriores se conservan: una venta fiada se devuelve al saldo del cliente, y una pagada con vale, al vale.
- **Cancelar** regresa cada parte a su lugar:
  - Lo fiado pendiente se descuenta del saldo del cliente.
  - Lo del vale vuelve al vale.
  - Si la venta es de otro turno, el efectivo sale de la caja abierta. Sale solo lo que queda en dinero: lo ya devuelto por tarjeta también se descuenta.

## Qué pasa a leer `SalePayment`

| Lugar | Cambio |
| --- | --- |
| Corte de caja (`cashSessionSummary`) | Ventas en efectivo = suma de la parte en efectivo; ventas por forma de pago, por su parte. |
| Resumen financiero (`financialSummary`) | Ventas por forma de pago y comisiones estimadas sobre cada parte. |
| Conciliación bancaria | Cada pago por banco se cruza por su monto. |
| Historial | El filtro por forma de pago incluye los pagos divididos que la usaron. La opción *Mixto* muestra solo los divididos. |
| Fiado (estado de cuenta y antigüedad) | Solo la parte fiada de cada venta. |
| Factura electrónica DGI | Una forma de pago por parte, prorrateada al total facturado. |
| CFDI (México) | La forma de pago de mayor monto; con parte fiada, pago en parcialidades (PPD). |
| Exportación de ventas | "Mixto (Efectivo 5.00 + Tarjeta 10.00)". |
| Ticket, WhatsApp y detalle de la venta | Cada pago con su referencia y el cambio. |

El reporte de desempeño por cajero no dependía de la forma de pago: cuenta ventas, descuentos, cancelaciones y faltantes de caja, así que no cambió.

## Migración

`20260930030000_pagos_divididos`:

- Agrega el valor `MIXED` al enum `PaymentMethod` y la tabla `SalePayment`.
- Hace el backfill: crea un pago por cada venta existente, con su forma de pago, su total, su referencia, su vale y su cobro de Yappy.

Así los cortes, reportes y saldos anteriores dan los mismos resultados. Lo verifica una prueba: calcula corte, reporte, comisiones y fiado, borra los pagos, aplica el `INSERT` de la migración y compara.

## Plan

Es una función básica, sin clave de plan. Cobrar con vale sigue requiriendo la función `giftCards`, también dentro de un pago dividido.

## Pruebas

- Unitarias (`tests/unit/pagos-divididos.test.ts`):
  - Resolución de pagos: cambio, lo que falta, lo que excede y renglones repetidos.
  - La forma principal de un pago dividido.
- Integración (`tests/integration/pagos-divididos.test.ts`):
  - Efectivo esperado, reportes, comisiones e historial con pago mixto.
  - La parte fiada: saldo, límite y puntos.
  - La parte con vale.
  - Límites de devolución y cancelación posterior.
  - Reglas de una venta fiada completa.
  - Backfill.
- De punta a punta (`e2e/pagos-divididos.spec.ts`):
  - Cobro con tarjeta y efectivo, con cambio, filtro *Mixto* y detalle de la venta.
  - Revisión con axe del pago dividido en modo claro y oscuro.
