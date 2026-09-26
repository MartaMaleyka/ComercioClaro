# Plan: ComercioClaro para Panamá

Basado en la investigación de mercado (septiembre 2026): cerca de 16,000 minisúper en Panamá, en su mayoría de comerciantes de origen asiático; 70% de las microempresas en la informalidad; factura electrónica obligatoria con PAC para quien supere B/.36,000 al año o 100 documentos al mes (Resolución DGI 201-6299, vigente desde el 1 de enero de 2026); ITBMS de 7/10/15%; Yappy como medio de pago dominante (1% + ITBMS por cobro). Las quejas más repetidas en sistemas similares: contratos largos, fondos retenidos, soporte deficiente y pocas integraciones.

## Estado

Fases 1 a 6 implementadas. Pruebas: `tests/unit/panama.test.ts`, `tests/integration/panama.test.ts` y `e2e/panama.spec.ts`. Cuenta de demostración: `demo.pa@comercioclaro.com` / `demo1234` (cajero con interfaz en chino: `cajero.pa@comercioclaro.com`).

## Objetivo

Que un minisúper, abarrotería o fonda en Panamá pueda usar ComercioClaro el primer día sin configurar nada: montos en B/., ITBMS correcto, cobro con Yappy, fiado con plazo, control de los límites del facturador gratuito de la DGI y, para dueños y cajeros que lo prefieren, interfaz en chino.

## Fases

### Fase 1 — Localización fiscal y regional
- País del negocio (`MX`, `PA`, otro) al registrarse y en Configuración. Define los valores por defecto: moneda, formato, zona horaria (`America/Panama`) e impuestos.
- Tasas de ITBMS: exento 0%, 7% general, 10% bebidas alcohólicas, 15% tabaco. El IEPS solo aplica a México.
- Montos mostrados como **B/.** (balboa a la par del dólar), con opción de mostrar USD.
- RUC y DV del negocio y del cliente; el RUC aparece en el ticket.

### Fase 2 — Yappy y costo de cobrar
- Yappy como forma de pago en el punto de venta, caja, reportes y exportaciones.
- Número de operación de Yappy por venta (para conciliar con el banco) y filtro de ventas por forma de pago.
- El QR o el número de directorio Yappy del comercio se muestra en el POS al elegir Yappy.
- Comisión configurable por medio de pago (Yappy 1.07% = 1% + ITBMS; tarjeta según el banco). Los reportes muestran las **comisiones estimadas** y la ganancia neta después de comisiones.

### Fase 3 — Fiado con plazo
- Días de crédito por cliente (por defecto 15, lo habitual en las abarroterías).
- Antigüedad de saldos: los abonos se aplican a la venta fiada más antigua (FIFO); se calcula el saldo vencido y los días de atraso.
- Clientes con saldo vencido en el tablero y en Clientes, con recordatorio por WhatsApp.

### Fase 4 — Factura electrónica DGI
- **Monitor de límites del facturador gratuito**: ingresos del año calendario contra B/.36,000 y documentos del mes contra 100, con aviso al 80% y al superar el límite.
- **Registro del CUFE**: quien factura en el facturador gratuito o con su PAC puede guardar el CUFE en la venta, para saber qué está facturado.
- Punto de extensión para integrar un PAC por API (requiere contrato y credenciales del PAC; queda fuera de esta entrega).

### Fase 5 — Operación de minisúper
- **Compra por caja, venta suelta**: unidades por empaque en el producto; en la compra se captura en cajas y el sistema convierte a unidades y costo unitario (cigarrillos, huevos, refrescos).
- **Pedido al distribuidor por WhatsApp** desde "Qué comprar", agrupado por proveedor.
- **Interfaz en chino simplificado (piloto)** para el menú, el punto de venta y la caja, con preferencia de idioma por usuario (español, 中文, English).

### Fase 6 — Demo, pruebas y documentación
- Cuenta de demostración panameña (`demo.pa@comercioclaro.com`) con productos y tasas reales de ITBMS.
- Pruebas unitarias, de integración y de punta a punta de los flujos panameños.

## Fuera de alcance (siguientes pasos)
- Integración directa con un PAC (Alanube, eFactura, etc.): requiere elegir proveedor y obtener credenciales de pruebas.
- QR dinámico de Yappy: requiere afiliación a Yappy Comercial y credenciales de la API del Banco General.
- Traducción completa de todas las pantallas al chino: primero validar el piloto con 5 a 10 comercios.
- Recargas y pago de servicios (requieren un agregador).
