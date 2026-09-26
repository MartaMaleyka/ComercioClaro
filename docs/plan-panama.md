# Plan: ComercioClaro para Panamá

Basado en la investigación de mercado (septiembre 2026): cerca de 16,000 minisúper en Panamá, en su mayoría de comerciantes de origen asiático; 70% de las microempresas en la informalidad; factura electrónica obligatoria con PAC para quien supere B/.36,000 al año o 100 documentos al mes (Resolución DGI 201-6299, vigente desde el 1 de enero de 2026); ITBMS de 7/10/15%; Yappy como medio de pago dominante (1% + ITBMS por cobro). Las quejas más repetidas en sistemas similares: contratos largos, fondos retenidos, soporte deficiente y pocas integraciones.

## Estado

Fases 1 a 6 implementadas, más la fase 7 (abajo). Pruebas: `tests/unit/panama.test.ts`, `tests/integration/panama.test.ts` y `e2e/panama.spec.ts`. Demostración: negocio "Minisúper El Dorado" en las cuentas Dueño (`demo@comercioclaro.com`) y Cajero (`cajero@comercioclaro.com`), contraseña `demo1234`; la interfaz en chino se elige en Configuración → Mi cuenta.

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
- Negocio de demostración panameño (Minisúper El Dorado, en las cuentas Dueño y Cajero) con productos y tasas reales de ITBMS.
- Pruebas unitarias, de integración y de punta a punta de los flujos panameños.

### Fase 7 — Lo que faltaba y funciones nuevas
- **Factura electrónica automática con PAC**: capa de proveedores con Alanube (API REST) y un PAC simulado para probar. Emisión al vender (en segundo plano), CUFE y QR en el ticket, notas de crédito en devoluciones, anulación, y contingencia: si el PAC o la DGI no responden, la factura queda pendiente y se reintenta con espera creciente (cron cada 15 minutos y botón "Reintentar pendientes"). Falta: credenciales de sandbox del PAC elegido para validar el formato real.
- **Yappy automático**: pasarela de Banco General (Botón de Pago / cobro al celular) y simulador. El cajero escribe el celular, el cliente confirma en su app y la venta se registra sola; la IPN se valida con HMAC-SHA256. Un cobro confirmado solo puede usarse en una venta. Falta: afiliación a Yappy Comercial y credenciales.
- **Conteo exacto de documentos**: la tarjeta de límites cuenta según la fuente disponible: facturas del PAC, cada venta y devolución (si el negocio factura todo) o CUFE registrados.
- **Traducción completa** al chino y al inglés de todas las pantallas (≈600 textos), con prueba automática que falla si un texto nuevo queda sin traducir y botón "Reportar traducción" para validarla con dueños de minisúper.
- **Promociones**, **puntos de lealtad**, **catálogo por WhatsApp**, **etiquetas con código de barras** y **conteo físico** (ideas tomadas de Treinta, Kyte, Loyverse y de las quejas de usuarios de POS en la región).

## Fuera de alcance (siguientes pasos)
- Validar el PAC con credenciales de sandbox reales (Alanube u otro autorizado por la DGI) y el formato exacto del documento.
- Afiliación a Yappy Comercial y prueba con el ambiente de pruebas de Banco General.
- Revisar la traducción al chino con 5 a 10 comercios usando los reportes de traducción.
- Recargas y pago de servicios (requieren un agregador).
