# Cobro automático de la suscripción

Prioridad 9 de la investigación. Hasta ahora cada pago del plan lo registraba a mano el super admin (transferencia o Yappy), y un pago vencido solo mostraba un aviso. Eso no escala: el dueño olvida pagar, el administrador persigue cobros, y un negocio puede quedar meses vencido.

No es una función de plan: aplica a toda la plataforma.

## Proveedor intercambiable

Se elige con `BILLING_PROVIDER`:

| Valor | Qué hace |
| --- | --- |
| `stripe` | Stripe Checkout para pagar y guardar la tarjeta; las renovaciones se cobran con la tarjeta guardada (`off_session`). Requiere `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. |
| `simulado` | Para pruebas y demostraciones, sin dinero real. La tarjeta •••• 4242 se aprueba; la •••• 0002 se guarda pero se rechaza al renovar. |
| vacío | Sin pago en línea: "Mi plan" lo indica y los pagos los sigue registrando el super admin. |

La integración con Stripe usa su API REST directamente (sin SDK):

- Parámetros en formato de formulario.
- Clave de idempotencia por cobro, para que un reintento de red no cobre dos veces.
- Verificación HMAC de la firma del webhook, con 5 minutos de tolerancia.

## Mi plan (dueño)

*Configuración → Mi plan* (`/configuracion/plan`):

- **Tu plan:** plan, ciclo, estado (al día, en prueba, prueba vencida, pago vencido, suspendido) y la fecha pagada. Si está vencido, muestra cuándo se suspenderá.
- **Pago automático:** tarjeta guardada, casilla *Renovar automáticamente al vencer* y *Quitar tarjeta*. Si un cobro falló, muestra el error, el intento (n de máx.) y la fecha del próximo.
- **Pagar en línea:**
  - Se elige el plan (los públicos, o el actual) y el ciclo (mensual o anual, con su precio).
  - Lleva a Stripe Checkout (o al pago simulado) y vuelve con `?pago=ok` o `?pago=cancelado`.
  - Pagar otro plan o ciclo cambia el plan del negocio al confirmarse el pago.
- **Pagos:** historial de pagos del negocio, en línea o registrados por el administrador.

**Negocio bloqueado** (prueba vencida o suspendido por falta de pago):

- La pantalla de bloqueo muestra *Pagar mi plan en línea* al dueño.
- *Mi plan* es la única página que se puede abrir.
- Al pagar, el negocio se reactiva de inmediato.

Un negocio que **suspendió el super admin** (por otro motivo) no se reactiva pagando: *Mi plan* indica que hay que contactar al administrador.

Los avisos de prueba por terminar y de pago vencido llevan el enlace *Pagar mi plan*.

## Webhook

`POST /api/billing/webhook` es público y valida la firma `Stripe-Signature` con `STRIPE_WEBHOOK_SECRET`. Eventos:

| Evento | Acción |
| --- | --- |
| `checkout.session.completed` (pagado) | Registra el pago, extiende la vigencia, guarda la tarjeta y activa la renovación automática. |
| `payment_intent.succeeded` | Confirma una renovación que quedó pendiente. |
| `payment_intent.payment_failed` | Cuenta el fallo de una renovación y programa el reintento. |
| `checkout.session.expired` | Cancela el cobro abandonado. |

**Registro del pago:**

- Se reutiliza `adminRecordPayment`, extraído a `recordSubscriptionPayment` para que corra dentro de la misma transacción.
- Queda un `SubscriptionPayment` con método *Tarjeta*, la referencia del pago y `createdById = "billing"`. En la bitácora del super admin aparece como *Cobro automático*.
- La vigencia se extiende por 1 mes (mensual) o 12 (anual):
  - En una **renovación**, desde el vencimiento, aunque se cobre en un reintento.
  - En un **pago del dueño**, desde el vencimiento, o desde hoy si ya venció.
- Se reinician los reintentos. Si la suspensión fue por falta de pago, el negocio se reactiva.

**Idempotencia:** el mismo evento dos veces, o dos a la vez, registra un solo pago. El cobro se marca como cobrado con una actualización condicional (`PENDING/FAILED → SUCCEEDED`) antes de registrar el pago.

## Cron diario

`GET /api/cron/billing` (con `Authorization: Bearer $CRON_SECRET`):

1. **Aviso antes del vencimiento** (días de aviso), una vez por vencimiento:
   - Con renovación automática: "el {fecha} cobraremos {monto} a tu Visa •••• 4242".
   - Si paga a mano: "tu plan vence el {fecha}, paga en Mi plan".
2. **Renovación:**
   - A los negocios vencidos con tarjeta y renovación automática se les cobra con la tarjeta guardada.
   - Si se aprueba: pago registrado y correo de confirmación.
   - Si se rechaza: se cuenta el fallo, se programa el reintento (*días entre reintentos*) y se envía un correo con el error, la fecha del reintento y la de suspensión.
   - Al llegar a *reintentos*, no se intenta más.
3. **Aviso antes de suspender:** cuando faltan *días de aviso* para terminar la gracia, se envía una vez.
4. **Suspensión:** al pasar los *días de gracia* desde el vencimiento:
   - El negocio queda `SUSPENDED` con `suspendedByBilling`, el motivo "Falta de pago: el plan venció el …" y un correo al dueño.
   - Queda en la bitácora del super admin.
5. Los checkouts abandonados de más de un día se cancelan.

**A quién se suspende:**

- Por defecto, solo a los negocios con renovación automática o con cobros fallidos. Quitar la tarjeta después de un rechazo no evita la suspensión.
- A quien paga a mano (transferencia o Yappy) no se le suspende, como antes, salvo que el super admin active *Suspender también a quien paga a mano*.

## Reglas (super admin)

*Planes y precios → Cobro automático* (una fila en `PlatformSettings`):

| Regla | Por defecto |
| --- | --- |
| Días de gracia | 7 |
| Reintentos | 3 |
| Días entre reintentos | 2 |
| Días de aviso (antes de cobrar y de suspender) | 3 |
| Suspender también a quien paga a mano | No |

El detalle del negocio en el panel muestra:

- La tarjeta y si renueva solo.
- Los cobros fallidos, con su error, y el próximo intento.
- Si la suspensión fue por falta de pago.

## Datos

Migración aditiva `20260930090000_suscripcion`:

- **`Business`:**
  - `autoRenew`, `billingCustomerId`, `billingMethodId`, `billingCardLabel`.
  - `billingFailures`, `nextChargeAt`.
  - `renewalNoticeFor` y `suspensionNoticeFor`: el vencimiento ya avisado, para no repetir el correo.
  - `suspendedByBilling`.
- **`SubscriptionCharge`:** cada intento de cobro.
  - Tipo: checkout o renovación.
  - Estado: pendiente, cobrado, fallido o cancelado.
  - Proveedor, monto, meses, ciclo, `externalId` único, error y el pago que generó.
- **`PlatformSettings`:** las reglas del cobro.

## Configuración

```bash
BILLING_PROVIDER="stripe"          # o "simulado"
STRIPE_SECRET_KEY="sk_live_…"
STRIPE_WEBHOOK_SECRET="whsec_…"
CRON_SECRET="…"                    # para /api/cron/billing (diario)
```

En Stripe, el webhook apunta a `https://TU-DOMINIO/api/billing/webhook` con los cuatro eventos de la tabla.

## Demostración

- `.env` con `BILLING_PROVIDER="simulado"`.
- *Fonda La Chiricana* tiene guardada la tarjeta de prueba •••• 4242, con renovación automática.
- En *Minisúper El Dorado* se puede pagar desde *Mi plan* con el pago de prueba.

## Pruebas

- **Unitarias** (`tests/unit/suscripcion.test.ts`): precio mensual y anual, fin de la gracia, centavos, formato de Stripe y firma del webhook (válida, otro secreto, cuerpo alterado, vencida).
- **Integración** (`tests/integration/suscripcion.test.ts`):
  - Checkout, webhook repetido y concurrente (un solo pago).
  - Aviso único y renovación desde el vencimiento.
  - Reintentos, aviso y suspensión; reactivación al pagar.
  - Quien paga a mano, y un negocio suspendido por el administrador.
  - Firma del webhook.
  - Llamadas a Stripe con `fetch` simulado: tarjeta guardada, idempotencia y rechazo.
- **E2E** (`e2e/suscripcion.spec.ts`, con el proveedor simulado):
  - Pagar desde *Mi plan*, tarjeta guardada, cancelar y reactivar la renovación.
  - El super admin cambia los días de gracia.
  - axe en *Mi plan* y en el pago de prueba, en modo claro y oscuro.

## Pendiente

- Facturas fiscales de la suscripción (CFDI o factura electrónica de Panamá) al cobrar.
- Pagos con Yappy en línea para la suscripción.
- Cambiar de plan a mitad de periodo con prorrateo: hoy el plan nuevo empieza al confirmarse el pago y extiende la vigencia.
