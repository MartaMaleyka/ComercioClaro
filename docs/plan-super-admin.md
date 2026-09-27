# Super admin: planes, precios y funciones

El super admin administra la plataforma completa desde `/admin`. No depende de ningún negocio.

## Qué puede hacer

| Pantalla | Para qué |
| --- | --- |
| **Resumen** (`/admin`) | Ingreso mensual recurrente, cobrado este mes y en los últimos 12 meses (por moneda), negocios por estado y por plan, pruebas por terminar y pagos vencidos. |
| **Negocios** (`/admin/negocios`) | Buscar por negocio, dueño o correo; filtrar por estado y plan; dar de alta un negocio con su dueño (contraseña temporal). |
| **Detalle del negocio** | Cambiar plan, ciclo (mensual o anual), estado (activo, en prueba, suspendido con motivo), fecha de fin de prueba y de pago, notas internas. Activar o desactivar cada función solo para ese negocio. Registrar pagos, ver uso contra los límites, usuarios, historial, y **entrar como soporte**. |
| **Planes y precios** (`/admin/planes`) | Crear y editar planes: precio mensual y anual, moneda, días de prueba, límites de usuarios, sucursales y productos, funciones incluidas, plan por defecto y visibilidad en la página de precios. |
| **Usuarios** (`/admin/usuarios`) | Nombrar o quitar administradores, bloquear y desbloquear, cerrar sesiones y generar una contraseña temporal. |
| **Bitácora** (`/admin/bitacora`) | Quién cambió qué y cuándo. |

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
  - *Pago vencido*: solo muestra un aviso. Suspender es una decisión del super admin.
  - *Suspendido*: los usuarios ven el motivo y no pueden usar el negocio. No se borra nada.
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
