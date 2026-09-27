# Campañas por WhatsApp y cupones

Prioridad 7 de la investigación. El comercio de barrio vive de que el cliente vuelva, y en Panamá casi todos los clientes están en WhatsApp. Los grandes supermercados mandan promociones personalizadas; la tienda pequeña no tenía cómo hacerlo ni cómo medir si funcionó.

## Consentimiento (Ley 81 de 2019)

- En la ficha del cliente, *Promociones por WhatsApp*: "Acepta recibir promociones por WhatsApp".
- Se guarda la fecha en que aceptó (`Customer.consentAt`). Si lo retira, se borra.
- **Solo reciben campañas los clientes que aceptaron** y tienen teléfono.
- La ficha también guarda el cumpleaños y etiquetas libres (vip, vecino…).

## Segmentos

| Segmento | Quién |
| --- | --- |
| Cumpleaños del mes | Cumpleaños en el mes en curso. |
| No han vuelto | Última compra hace más de N días (por defecto 30). |
| Clientes frecuentes | Al menos N compras en los últimos 90 días (por defecto 4). |
| Con fiado vencido | Saldo vencido según la antigüedad del fiado. |
| Por etiqueta | Clientes con esa etiqueta. |
| Todos los que aceptaron | Todos los que dieron su consentimiento. |

Antes de crear la campaña se ve cuántos clientes la recibirán y algunos nombres.

## Campaña

- **Plantilla:** usa `{nombre}` (el primer nombre), `{puntos}` (puntos de lealtad) y `{cupón}`. El mensaje de cada destinatario queda guardado al crear la campaña.
- **Envío asistido** (sin costo, sin la API paga): cada destinatario tiene su enlace de WhatsApp con el mensaje listo. El dueño lo envía desde su teléfono y lo marca como enviado.
- **Envío directo:** si se configura la API de WhatsApp Business (`WHATSAPP_PROVIDER=cloud`, `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`), el botón *Enviar pendientes* manda todos. Los errores quedan por destinatario y se pueden reintentar.
  - Con `WHATSAPP_PROVIDER=simulado` se simula el envío para pruebas: los números que terminan en 0000 fallan.
  - Fuera de la ventana de 24 horas, Meta exige plantillas aprobadas para mensajes de marketing. Hasta configurarlas, el envío asistido es la vía recomendada.
- **Resultados:**
  - Clientes que compraron y porcentaje de conversión.
  - Ventas atribuidas: compras de los destinatarios en los 14 días siguientes.
  - Canjes del cupón y descuento otorgado.

## Cupones

- **Código:** en mayúsculas; se aceptan minúsculas y espacios al escribirlo.
- **Descuento:** porcentaje o monto fijo.
- **Condiciones opcionales:** compra mínima, vigencia y usos máximos. Se puede desactivar.
- **En el punto de venta:** campo *Cupón* con el botón *Aplicar*, que consulta el cupón y muestra el descuento.
  - Al cobrar, el servidor lo valida otra vez y cuenta el uso sin pasar del límite, aunque dos cajas lo usen a la vez.
- **Cálculo:** el descuento se calcula sobre el total después del descuento general y nunca pasa de ese total. Queda en la venta (`Sale.couponId` y `couponDiscount`), en el ticket y en el mensaje de WhatsApp. Los reportes, el ITBMS y la contabilidad lo toman porque ya está en el total.
- **Al cancelar la venta** se devuelve el uso del cupón.
- **Sin conexión:** el cupón necesita conexión, porque se valida en el servidor.

## Plan

Función `campaigns` ("Campañas por WhatsApp y cupones"). Está incluida en Pro y Empresarial.

## Datos

| Modelo | Para qué |
| --- | --- |
| `Customer.marketingConsent`, `consentAt`, `birthday`, `tags` | Consentimiento, cumpleaños y etiquetas. |
| `Coupon` | Código, tipo, valor, compra mínima, vigencia, usos. |
| `Campaign` | Nombre, plantilla, segmento, cupón y estado. |
| `CampaignRecipient` | Destinatario, teléfono, mensaje personalizado y estado del envío. |
| `Sale.couponId`, `couponDiscount` | Cupón aplicado en la venta. |

Migración `20260930070000_campanas`. Solo agrega.

## Pruebas

- Integración (`tests/integration/campanas.test.ts`):
  - Mensaje personalizado.
  - Fecha del consentimiento.
  - Los segmentos solo incluyen clientes que aceptaron y tienen teléfono (cumpleaños, etiqueta, no han vuelto, frecuentes, fiado vencido).
  - Cupón con compra mínima, límite de usos, vencimiento, tope al total, función de plan y devolución del uso al cancelar.
  - Campaña con envío asistido, envío simulado con un error y resultados (compradores, ventas atribuidas y canjes).
- De punta a punta (`e2e/campanas.spec.ts`):
  - Campaña con cupón y envío asistido.
  - Cupón en el punto de venta.
  - Revisión con axe de campañas, detalle, formulario, cupones y la ficha del cliente, en modo claro y oscuro.
