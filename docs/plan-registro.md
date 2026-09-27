# Registro y bienvenida

Primer PR del plan de registro, control y seguridad. Antes el registro pedía cinco datos y dejaba al dueño en un tablero vacío. Nadie confirmaba el correo, no quedaba constancia de los términos y el super admin no se enteraba de los registros nuevos.

## Formulario (`/registro`)

- **Plan elegido:** si la persona viene de la página de precios (`/registro?plan=pro`), se muestra el plan con su prueba y su precio, y un enlace para cambiarlo.
- **Datos:** nombre, nombre del negocio, **tipo de negocio**, país, **teléfono o WhatsApp** (opcional), correo y contraseña.
  - Al elegir el tipo se ve qué le sugerimos.
  - La contraseña tiene botón para mostrarla y una guía de fortaleza. El servidor sigue exigiendo el mínimo de 8 caracteres.
- **Términos y privacidad:** hay que aceptarlos para crear la cuenta. Se guardan la fecha y la versión (`User.termsAcceptedAt` y `termsVersion`). Las páginas `/terminos` y `/privacidad` son públicas.
- **Contra bots:**
  - Un campo trampa oculto que una persona no llena.
  - Un tiempo mínimo de 2.5 s entre abrir el formulario y enviarlo.
  - El límite de 5 registros por hora por IP que ya existía.

> Los textos de términos y privacidad son una plantilla basada en la Ley 81 de 2019 (Panamá) y la LFPDPPP (México). **Hay que revisarlos con un abogado antes de producción.** El correo de contacto sale de `SUPPORT_EMAIL`.

## Tipo de negocio

| Tipo | Sugerencias |
| --- | --- |
| Minisúper o abarrotería | Balanza, proveedores y compras a crédito |
| Fonda, restaurante o cafetería | Modo restaurante encendido, recetas e insumos |
| Carnicería, pollería o verdulería | Balanza y etiquetas de peso |
| Tienda de ropa, calzado o regalos | Promociones |
| Ferretería o materiales | Proveedores y cuentas por pagar |
| Farmacia o perfumería | Caducidad por lote |
| Otro | Los pasos básicos |

El tipo no cambia el plan: las funciones siguen dependiendo del plan y de los ajustes del super admin. Solo sugiere la configuración y los pasos de la guía, y lo verá el super admin.

## Al crear la cuenta

1. Se crean el dueño y su negocio con `signupSource = SELF`. Los que da de alta el super admin quedan con `ADMIN`.
2. **Correo de bienvenida** con el enlace para confirmar el correo (vale 24 horas), los primeros pasos y la fecha en que termina la prueba.
3. **Aviso a los super admins:** un correo con el negocio, el dueño, el tipo, el país y el plan. Además queda en la bitácora del panel como *Se registró un negocio*.
4. **A dónde va:** al tablero. Si eligió un plan de pago sin prueba y hay pago en línea, va a *Mi plan* para pagar.

Si los correos fallan, el registro no se detiene: el dueño puede pedir otro enlace.

## Confirmación del correo

- `/verificar-correo?token=…` (pública) confirma con un **botón**. No se confirma al abrir la página, para que los lectores de correo que revisan enlaces no gasten el enlace.
- El enlace es de un solo uso y se guarda cifrado. Pedir uno nuevo anula el anterior.
- Mientras no esté confirmado, la app muestra un aviso con *Reenviar enlace* (máximo 3 por hora).
- Los usuarios que ya existían quedan confirmados (la migración usa su fecha de creación).

## Guía de primeros pasos (tablero del dueño)

La tarjeta *Primeros pasos* muestra el avance ("3 de 7 listos") y un botón por paso:

- **Comunes:** confirmar el correo (con reenvío), agregar productos, abrir la caja, hacer la primera venta e invitar al equipo.
- **Según el tipo,** si el plan incluye la función:
  - Fonda: recetas.
  - Minisúper y carnicería: balanza.
  - Minisúper y ferretería: proveedores.
  - Tienda: promociones.
  - Farmacia: caducidad.
- **Pagar el plan:** en prueba o con el pago pendiente, si hay pago en línea.

Se oculta sola al completarse o con la ✕ (`Business.onboardingDismissedAt`). *Configuración* abre en la pestaña pedida (`?tab=usuarios`).

## Prueba por terminar

El cron diario de cobro (`/api/cron/billing`) envía un correo cuando faltan los *días de aviso* para que termine la prueba, una sola vez por prueba (`Business.trialNoticeFor`). El correo lleva el enlace a *Mi plan*.

## Datos

Migración aditiva `20260930110000_registro`:

- **`User`:** `emailVerifiedAt`, `emailVerifyHash` (único), `emailVerifyExpires`, `termsAcceptedAt` y `termsVersion`.
- **`Business`:** `businessType`, `signupSource`, `onboardingDismissedAt` y `trialNoticeFor`.

## Pruebas

- **Integración** (`tests/integration/registro.test.ts`):
  - Términos, tipo y origen; bienvenida y aviso al super admin; bitácora.
  - Confirmación de un solo uso, el enlace nuevo que anula el anterior y el enlace vencido.
  - El plan de pago sin prueba lleva a *Mi plan*.
  - La guía por tipo y su avance.
  - El aviso de prueba por terminar se envía una sola vez.
- **E2E** (`e2e/registro.spec.ts`):
  - Registro con el plan elegido, términos obligatorios, aviso y guía, reenvío del enlace y ocultar la guía.
  - Rechazo de bots (campo trampa y envío instantáneo) y de términos sin aceptar.
  - Enlace de confirmación inválido.
  - axe en registro, términos, privacidad, confirmación y el tablero con la guía, en modo claro y oscuro.
