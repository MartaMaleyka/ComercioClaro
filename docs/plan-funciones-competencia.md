# Plan: funciones que ofrece la competencia

Origen: investigación de septiembre de 2026 sobre puntos de venta en Panamá (Multitask, Factura Fácil, cifraHQ, Alegra, RollPrints, Facturapp) y en el extranjero (Loyverse, Square, Kyte, Treinta, SumUp). Aquí están las diez funciones que ComercioClaro no tenía, en el orden en que se implementan: primero lo que da más valor a un minisúper panameño con menos riesgo.

Criterios que aplican a todas las fases:

- **Dinero correcto**: cada fase define cómo afecta la caja (efectivo esperado), los reportes (ingresos, utilidad) y el inventario, con pruebas de integración.
- **Sin romper lo existente**: las migraciones solo agregan tablas, columnas con valor por defecto o valores de enum.
- **Traducción y accesibilidad**: todo texto nuevo pasa por `tr()` con chino e inglés (la prueba de cobertura lo exige) y las pantallas nuevas pasan la revisión de axe.

## Fase 1 — Reporte mensual de ITBMS/IVA
**Para qué:** preparar la declaración mensual (Formulario 430 de ITBMS en Panamá) sin calcular a mano.

- Ventas del mes por tasa de impuesto: monto con impuesto, base gravable e impuesto (los precios incluyen impuesto).
- El descuento general y los puntos se prorratean. Las devoluciones restan en el mes en que se hacen, como una nota de crédito.
- Pantalla en Reportes con selector de mes y exportación a CSV.
- **Límite:** las compras no guardan su ITBMS, así que el crédito fiscal se sigue calculando aparte.

## Fase 2 — Desempeño por cajero
**Para qué:** saber quién vende, quién descuenta y quién tiene faltantes en caja (Loyverse lo cobra aparte).

- Por usuario: número de ventas, total vendido, ticket promedio, descuentos manuales (sin contar promociones), cancelaciones, devoluciones y diferencias en los cortes de caja que cerró.

## Fase 3 — Pantalla para el cliente
**Para qué:** que el cliente vea lo que se le cobra y pague con Yappy escaneando el QR sin pedirle el celular al cajero (como el Customer Display de Loyverse).

- Página `/pantalla-cliente` a pantalla completa: productos, promociones, total grande, puntos del cliente, QR de Yappy cuando se elige Yappy, y mensaje de gracias con el cambio al terminar.
- Se sincroniza con el punto de venta en el mismo equipo (segundo monitor, `BroadcastChannel`) y en otro equipo, como una tableta, a través del servidor.

## Fase 4 — Conciliación de Yappy y banco
**Para qué:** detectar cobros que no llegaron a la cuenta, como hace cifraHQ.

- Se sube el estado de cuenta en CSV. Las columnas (fecha, descripción o referencia, monto) se detectan solas.
- Cada depósito se cruza con las ventas: primero por número de operación y luego por monto y día.
- Resultado: conciliados, depósitos sin venta y ventas sin depósito. Se puede hacer con Yappy, transferencias o tarjeta.

## Fase 5 — Bandeja de pedidos en línea
**Para qué:** que los pedidos del catálogo no se pierdan en WhatsApp (como Kyte).

- El catálogo público guarda el pedido con número y lo sigue enviando por WhatsApp.
- Pantalla **Pedidos** con estados (nuevo, aceptado, listo, entregado, cancelado) y aviso de pedidos nuevos en el menú.
- "Cobrar en el punto de venta" carga el pedido en el carrito. Al cobrar, el pedido queda entregado y enlazado a la venta.

## Fase 6 — Órdenes de compra y traspasos entre sucursales
**Para qué:** el pedido formal al distribuidor y el movimiento de mercancía entre sucursales (Square).

- **Órdenes de compra:**
  - Borrador → enviada (por WhatsApp) → parcial → recibida.
  - Se crean a mano o desde "Qué comprar".
  - Al recibir se registra la compra (costo promedio, lotes) por lo que realmente llegó.
- **Traspasos:**
  - La mercancía sale de la sucursal de origen al enviarse y entra a la de destino al recibirse.
  - En destino, el producto se encuentra por código de barras, SKU o nombre; si no existe, se crea.
  - Cancelar un traspaso en tránsito devuelve la mercancía al origen.

## Fase 7 — Recargas y pago de servicios
**Para qué:** registrar en la caja las recargas y pagos de luz o agua que el minisúper cobra en la terminal del proveedor (Western Union, Punto Pago), para que el corte cuadre y la comisión cuente como ingreso.

- Registro desde el punto de venta con tipo, proveedor, referencia, monto y forma de pago.
- La comisión se configura por proveedor.
- El monto cobrado entra a la caja, pero no es venta (se le debe al proveedor). La comisión suma a la ganancia.
- **Límite:** la conexión directa con un agregador de recargas requiere contrato. La tabla y el registro quedan listos para ese adaptador.

## Fase 8 — Tarjetas de regalo (vales)
**Para qué:** vender vales y cobrar con ellos (Square).

- Emisión con código y código de barras imprimible; el dinero recibido entra a la caja como pasivo, no como venta.
- Forma de pago **Vale** en el punto de venta.
  - Por ahora el vale debe cubrir toda la venta, porque el sistema no divide pagos.
  - Una devolución o cancelación regresa el saldo al vale.
- Historial de movimientos por vale y anulación.

## Fase 9 — Variantes y extras
**Para qué:** tiendas de ropa (tallas y colores) y comida (extras con precio), como Kyte, Loyverse y Square.

- **Variantes:**
  - Productos del mismo grupo (p. ej. "Camiseta básica": S, M, L), cada uno con su existencia y código.
  - En el punto de venta se muestran como una sola tarjeta y se elige la variante.
  - Un asistente crea las variantes.
- **Extras:**
  - Lista de extras con precio por producto (p. ej. "Queso +0.50").
  - Al vender se eligen y se suman al precio. El servidor los valida y guarda en el renglón lo que se cobró.

## Fase 10 — Cuentas abiertas y pantalla de cocina
**Para qué:** fondas y cafeterías (Multitask, Loyverse KDS), un mercado grande en Panamá.

- Modo restaurante activable en Configuración.
- Guardar el carrito como **cuenta abierta** ("Mesa 3", "Para llevar"), retomarla, agregar productos y cobrarla al final.
- Los productos marcados "van a cocina" aparecen en la **pantalla de cocina** (`/cocina`).
  - Cada platillo pasa por los estados pendiente → preparando → listo → servido.
  - El color indica cuánto tiempo lleva esperando.

## Fuera de alcance
- Conexión directa con agregadores de recargas y cobro con tarjeta en el celular (Tap to Pay): requieren contratos con terceros.
- Pagos divididos (varias formas de pago en una venta): cambia el modelo de ventas, la caja y los reportes. Es la siguiente mejora natural después de los vales.

## Estado
Las diez fases están implementadas en la rama `claude/competitive-features`.

- Pruebas de integración: `tests/integration/competencia.test.ts` (una por fase).
- Pruebas unitarias de la lectura del estado de cuenta y la conciliación: `tests/unit/competencia.test.ts`.
- Pruebas de punta a punta de los flujos principales: `e2e/competencia.spec.ts`.
- Las pantallas nuevas pasan la revisión de accesibilidad: `e2e/accessibility.spec.ts`.
- Demo de restaurante: `demo.fonda@comercioclaro.com` / `demo1234`.
