# Super admin: planes, precios y funciones

El super admin administra la plataforma completa desde `/admin`. No depende de ningún negocio.

## Qué puede hacer

| Pantalla | Para qué |
| --- | --- |
| **Resumen** (`/admin`) | Ingreso mensual recurrente, cobrado este mes y en los últimos 12 meses (por moneda), negocios por estado y por plan, pruebas por terminar y pagos vencidos. |
| **Negocios** (`/admin/negocios`) | Buscar por negocio, dueño o correo; filtrar por estado y plan; dar de alta un negocio con su dueño (contraseña temporal). |
| **Detalle del negocio** | Cambiar plan, ciclo (mensual o anual), estado (activo, en prueba, suspendido con motivo), fecha de fin de prueba y de pago, notas internas. Activar o desactivar cada función solo para ese negocio. Registrar pagos, ver uso contra los límites, usuarios, historial, y **entrar como soporte**. |
| **Planes y precios** (`/admin/planes`) | Crear y editar planes: precio mensual y anual, moneda, días de prueba, límites de usuarios, sucursales y productos, funciones incluidas, plan por defecto y visibilidad en la página de precios. Reglas del **cobro automático**: días de gracia, reintentos, días entre reintentos y de aviso (ver [`plan-suscripcion.md`](plan-suscripcion.md)). |
| **Usuarios** (`/admin/usuarios`) | Nombrar o quitar administradores, bloquear y desbloquear, cerrar sesiones y generar una contraseña temporal. |
| **Bitácora** (`/admin/bitacora`) | Quién cambió qué y cuándo. |

## Registros, bajas y reactivaciones

**Resumen** (`/admin`):

- **Registros por semana** (8 semanas): cuántos negocios se registraron y, de esos, cuántos ya vendieron, pagaron o se dieron de baja (con porcentaje).
- **Registros recientes** (7 días): tipo, plan y origen de cada uno.
- *Requieren atención* también muestra los registros que esperan aprobación.

**Negocios** (`/admin/negocios`):

- **Aprobar a mano los registros nuevos:** un interruptor, apagado por defecto. Encendido, quien se registra queda *Por aprobar* (sin prueba) hasta que el super admin lo apruebe. El super admin recibe el correo "Registro por aprobar", y el dueño ve "Tu negocio está en revisión". Si hay registros esperando, aparece un aviso con *Ver por aprobar*, y cada uno se aprueba desde la lista.
- **Filtros:** estado (incluye *Por aprobar* y *Dado de baja*), plan, país, tipo de negocio, origen (registro propio o alta del admin) y fechas de registro. Los filtros quedan en la dirección y se pueden quitar de un clic.
- **Columnas:**
  - Negocio: tipo, país, correo del dueño y si lo confirmó.
  - Plan y estado (con el motivo si se dio de baja).
  - Fecha de registro y origen.
  - Actividad: último acceso de los dueños y última venta.
  - Vencimiento, ventas y usuarios.
- **Exportar CSV** con los mismos filtros, compatible con Excel. Queda en la bitácora.

**Ficha del negocio:**

- **Aprobar** (si está por aprobar): empieza la prueba del plan desde hoy y avisa al dueño.
- **Dar de baja** (o **Rechazar** un registro):
  - Pide un motivo obligatorio y deja elegir si se avisa al dueño.
  - Nadie puede usar el negocio y se detiene el cobro automático. Los datos se conservan.
- **Reactivar:** vuelve a su prueba si sigue vigente, o queda activo. Avisa al dueño.
- **Usuarios:** si confirmaron el correo, su último acceso y cuándo aceptaron los términos.
- El encabezado muestra el tipo de negocio y el origen. El estado de la suscripción no se cambia a mano mientras el negocio está por aprobar o dado de baja.

Cada acción queda en la bitácora: *Aprobó un registro*, *Dio de baja un negocio*, *Reactivó un negocio*, *Exportó la lista de negocios* y *Cambió la aprobación de registros*.

## Funciones por plan y por negocio

**Planes y precios → Funciones por plan** (`/admin/planes?vista=funciones`):

- Las funciones se agrupan por categoría: ventas y cobro, clientes y marketing, inventario y compras, finanzas y contabilidad, y operación y equipo.
- Cada plan tiene un interruptor por función. El cambio se guarda al momento y se aplica a todos los negocios del plan, salvo los que tengan un ajuste a mano.
- Quitar una función de un plan con negocios pide confirmación y dice a cuántos afecta. No se borra ningún dato: al volver a encenderla, todo sigue ahí.
- Se puede buscar una función y filtrar por las **nuevas** o por las que **no están en todos los planes**. Un aviso señala las funciones nuevas que faltan en algún plan activo.
- **En uso** muestra cuántos negocios tienen la función y cuántos ajustes a mano hay. Al abrirlo aparece la lista de negocios, y cada uno se ajusta con *Plan / Sí / No*.

**Ficha del negocio → Funciones:**

- Funciones agrupadas por categoría, cada una con *Plan (sí/no) / Sí / No*. Se guarda al momento, sin botón Guardar.
- Buscador, contador "N de M activas", ajustes a mano y el botón *Volver todo al plan*.

**Editor del plan:** las funciones van agrupadas, con *Todas / Ninguna* por grupo y la etiqueta *Nueva*.

**Funciones que ahora se pueden apagar:**

- **Cuentas por pagar:** la pestaña *Por pagar*, las compras a crédito, la tarjeta del tablero y las alertas por correo.
- **Pagos divididos:** el botón *Dividir pago* y las ventas con varios pagos.
- **Balanza conectada:** el botón *Pesar*, las etiquetas de peso y la configuración de la balanza.

Antes estaban en todos los planes, y la migración `20260930100000_funciones_basicas` las agrega a los planes existentes: nadie pierde nada.

Cada cambio queda en la bitácora: *Cambió una función de un plan* o *Ajustó una función de un negocio*.

## Reglas

- **Funciones por plan.** Estas son las funciones que se pueden habilitar o deshabilitar:
  - Promociones y puntos de lealtad.
  - Catálogo en línea (con pedidos y zonas de entrega).
  - Yappy automático y factura electrónica con PAC.
  - Modo restaurante, pantalla para el cliente, vales, y recargas y pago de servicios.
  - Órdenes de compra, sucursales y traspasos, y conciliación bancaria.
  - Reportes avanzados, variantes y extras, conteo físico y exportación a CSV.
  - Recetas e insumos, flujo de caja y punto de equilibrio, contabilidad automática, planilla, y campañas y cupones.
- **Se validan en el servidor.** La API responde "Tu plan no incluye…" y las pantallas ocultan lo que no está incluido.
- **Siempre incluido, en todos los planes:**
  - Vender, caja, inventario, clientes y fiado, compras, gastos, reportes básicos y venta sin conexión.
  - El descuento de jubilado, porque lo exige la ley.
  - El respaldo completo de los datos.
- **Ajustes por negocio.** Cada función puede quedar "según el plan", "activada" o "desactivada" solo para un negocio.
- **Negocios anteriores a los planes.** Quedan sin plan y conservan todas las funciones hasta que el super admin les asigne uno.
- **Límites.** Aplican a usuarios del negocio, sucursales del dueño y productos activos. Si un campo está vacío, no hay límite.
- **Estados:**
  - *En prueba*: se avisa en la última semana. Al vencer, el negocio se bloquea hasta que se active un plan.
  - *Pago vencido*: muestra un aviso. Con renovación automática (o si el super admin lo configura para todos), se suspende solo al pasar los días de gracia; ver [`plan-suscripcion.md`](plan-suscripcion.md).
  - *Suspendido*: los usuarios ven el motivo y no pueden usar el negocio. No se borra nada.
  - *Por aprobar*: registro que espera la aprobación del super admin (solo si está encendida).
  - *Dado de baja*: no se puede usar, sin cobro automático, con los datos conservados; se puede reactivar.
- **Pagos.** Cada pago extiende la vigencia desde el vencimiento actual (o desde hoy, si ya venció) por los meses pagados. Además, activa una prueba y puede reactivar un negocio suspendido.
- **Registro.** El negocio nuevo recibe el plan elegido en la página de precios (`/registro?plan=pro`) o el plan por defecto, con sus días de prueba.
- **Sucursales.** Una sucursal nueva hereda el plan y el estado del negocio del que sale.
- **Soporte:**
  - El super admin puede entrar a cualquier negocio con permisos de dueño.
  - Queda registrado en la bitácora de la plataforma y en la del negocio.
  - Un aviso morado recuerda que está en modo soporte.

## Primer administrador en producción

```bash
npm run admin:grant -- tu-correo@dominio.com "Tu nombre"
```

- Si el usuario existe, lo convierte en administrador.
- Si no existe, lo crea con una contraseña temporal que se debe cambiar al entrar.

## Demo

- **Super admin:** `admin@comercioclaro.com` / `demo1234`.
- **Planes de ejemplo:**
  - **Básico:** B/.9.99 al mes.
  - **Pro:** B/.19.99 al mes; es el plan por defecto.
  - **Empresarial:** B/.39.99 al mes.
- **Negocios de ejemplo:**
  - Miscelánea La Esperanza: plan Pro.
  - Minisúper El Dorado y Fonda La Chiricana: plan Empresarial.
  - Abarrotería Los Santos: en prueba del plan Básico.

## Pruebas

- **Unitarias** (reglas de funciones y estados): `tests/unit/features.test.ts`.
- **De integración:** `tests/integration/super-admin.test.ts`. Cubren:
  - Registro con plan y límites.
  - Promociones y vales fuera del plan.
  - Catálogo apagado.
  - Suspensión y pagos.
  - Alta de negocios.
  - Bloqueo de usuarios.
- **De punta a punta:** `e2e/admin.spec.ts`. Cubren la portada con precios, desactivar una función, suspender y reactivar con un pago, el modo soporte y el acceso denegado. La revisión de accesibilidad incluye las pantallas del panel.
