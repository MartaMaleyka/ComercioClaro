# ComercioClaro

Plataforma web para pequeños negocios (kioscos, misceláneas, tiendas de abarrotes, salones de belleza) para vender, cobrar fiado, hacer el corte de caja, controlar el inventario y conocer la ganancia real, desde el celular.

## Funcionalidades

- **Punto de venta**: búsqueda rápida, lector de código de barras (USB/Bluetooth o la cámara del celular), venta a granel (kg, l), precio de mayoreo, descuentos, forma de pago (efectivo con cálculo de cambio, tarjeta, transferencia, fiado), atajos de teclado (F2 buscar, F9 cobrar).
- **Venta sin conexión (PWA)**: se instala como app. Si se va el internet, las ventas se guardan en el dispositivo y se envían al volver la red sin duplicarse.
- **Tickets**: impresión en impresoras térmicas de 58/80 mm y envío por WhatsApp.
- **Devoluciones y cancelaciones** con motivo: el inventario, la caja y el saldo del cliente se ajustan solos.
- **Fiado / clientes**: límite de crédito, abonos, estado de cuenta y recordatorio por WhatsApp.
- **Caja**: apertura con fondo, entradas y salidas, corte con efectivo esperado contra contado (el cajero cuenta sin ver el esperado).
- **Inventario**: existencias, kardex (historial de movimientos), ajustes con motivo (conteo, merma, caducidad, robo), categorías, lotes con caducidad (FEFO) y sugerencias de reabastecimiento según la venta promedio.
- **Compras y proveedores**: costo promedio ponderado, lotes y caducidades, compras pagadas de caja, historial de precios por proveedor.
- **Gastos** (renta, luz, sueldos...) para calcular la **ganancia neta**.
- **Reportes**: ventas netas, costo de lo vendido, utilidad bruta y margen, ganancia neta, más vendidos con utilidad, utilidad por categoría, gastos por categoría y consolidado de sucursales.
- **Usuarios y roles**: dueño y cajero (el cajero no ve costos, reportes ni configuración) y bitácora de auditoría.
- **Sucursales**: cada una con su inventario, caja y ventas. Se puede copiar el catálogo.
- **Facturación CFDI 4.0 (México)** vía Facturama: factura a clientes y factura global al público en general.
- **Importar/exportar**: catálogo desde Excel (CSV), exportación de ventas, compras, gastos y clientes, y respaldo completo en JSON.
- **Alertas por correo** de bajo inventario y caducidad (cron diario).
- Modo oscuro, moneda, formato por país y zona horaria configurables.

### Panamá

Plan y alcance en [`docs/plan-panama.md`](docs/plan-panama.md).

- **País del negocio** (Panamá, México u otro) al registrarse: ITBMS 7/10/15% y exento, montos en **B/.**, zona horaria `America/Panama`, RUC y DV en el ticket con el ITBMS incluido desglosado.
- **Yappy** como forma de pago: QR o directorio del comercio en el punto de venta, número de operación para conciliar, filtro en el historial y separación en el corte de caja. Con Yappy Comercial, **cobro automático**: el cajero escribe el celular del cliente y la venta se registra sola al confirmarse el pago (notificación IPN firmada con HMAC). Incluye un simulador para probar sin credenciales.
- **Comisiones por medio de pago** (Yappy 1.07%, tarjeta y transferencia configurables) y ganancia después de comisiones en los reportes.
- **Fiado con plazo**: días de crédito por cliente (15 por defecto), vencimientos, saldo vencido con días de atraso (los abonos se aplican FIFO) y recordatorio por WhatsApp.
- **Factura electrónica DGI**: monitor de los límites del facturador gratuito (B/.36,000 al año y 100 documentos al mes, Resolución 201-6299) con aviso al 80% y registro del **CUFE** de las facturas emitidas en la DGI o un PAC. Con un PAC (Alanube o el simulado), **emisión automática** de cada venta con CUFE y QR en el ticket, notas de crédito y **contingencia** con reintentos. El conteo mensual es exacto cuando se factura cada venta o se usa el PAC.
- **Compra por caja, venta suelta** (unidades por empaque) y **pedido al distribuidor por WhatsApp** desde "Qué comprar".
- **Interfaz en chino simplificado e inglés en todas las pantallas**, elegible por usuario, con botón **Reportar traducción** (el dueño ve los reportes en Configuración → Bitácora). ([captura](docs/screenshots/clientes-zh.png))

### Capital e interior de Panamá

Investigación, plan y fuentes en [`docs/plan-panama-regiones.md`](docs/plan-panama-regiones.md).

- **Libra, onza y galón** como unidades de venta a granel. En Panamá, la libra aparece primero.
- **Descuento de jubilado (Ley 6 de 1987)**:
  - Porcentaje por tipo de negocio: 25% restaurante, 15% comida rápida, 20% farmacia.
  - Marca por producto y botón **Jubilado** en el punto de venta; se guarda solo el número de cédula o carné.
  - No se suma a una promoción: se aplica el que más le conviene al cliente.
  - Reporte mensual con CSV para Acodeco.
- **Fiado a la quincena o a la cosecha**:
  - Plazo por cliente: días, próxima quincena (15 o fin de mes) o una fecha fija.
  - El tablero muestra lo que vence esta quincena.
- **Corte de caja por billetes y monedas** (de $100 a 1¢). El detalle queda guardado.
- **Interior sin señal**: días configurables para vender sin conexión (7 en la capital, 30 en el interior) y aviso cuando una venta lleva más de un día sin enviarse.
- **Entregas en la capital**:
  - Zonas de entrega con su costo. El catálogo pide la zona y un punto de referencia.
  - El cargo llega al punto de venta como un servicio.
  - Productos de servicio sin existencias.
- **Perfil capital o interior** en Configuración, que aplica los valores recomendados.

### Seguridad de las cuentas

- Verificación en dos pasos con app de autenticación y códigos de recuperación: obligatoria para el super admin y exigible por negocio ([`docs/plan-seguridad.md`](docs/plan-seguridad.md)).
- Sesiones por dispositivo que se pueden cerrar una por una, historial de inicios de sesión y aviso por correo de un dispositivo nuevo.
- Contraseñas comunes rechazadas y la IP del cliente tomada del proxy de confianza.
- En el panel: actividad de cada usuario, cambiar su correo, quitar los dos pasos y filtros por seguridad.

### Registro y bienvenida

- Registro con el plan elegido, tipo de negocio, teléfono y aceptación de términos y privacidad, con protección contra bots ([`docs/plan-registro.md`](docs/plan-registro.md)).
- Correo de bienvenida con confirmación del correo, aviso al super admin de cada registro y guía de primeros pasos según el tipo de negocio.
- Aviso por correo cuando la prueba está por terminar.

### Super admin: planes, precios y funciones

Detalle en [`docs/plan-super-admin.md`](docs/plan-super-admin.md).

- **Panel `/admin`** para quien administra la plataforma.
  - Ingreso mensual recurrente y lo cobrado.
  - Negocios por estado y por plan.
  - Pruebas por terminar y pagos vencidos.
- **Planes** con precio mensual y anual, días de prueba, límites (usuarios, sucursales, productos) y funciones incluidas. Se muestran en la página de precios de la portada.
- **Por negocio:**
  - Asignar plan, ciclo de cobro, prueba y vigencia.
  - Suspender con motivo, sin borrar datos.
  - Activar o desactivar funciones solo para ese negocio.
  - Registrar pagos y entrar como soporte.
- **Usuarios:** administradores, bloqueo, cierre de sesiones y contraseña temporal.
- **Bitácora** de todo lo que hace el super admin.
- **Registros y bajas:** embudo semanal de registros, aprobación opcional de registros nuevos, dar de baja y reactivar negocios con motivo, y lista con tipo, origen, actividad y correo confirmado, con filtros y exportación a CSV.
- **Funciones por plan** (pestaña de *Planes y precios*): interruptores por plan agrupados por categoría, con buscador y aviso de funciones nuevas; ajuste por negocio con *Plan / Sí / No* desde la ficha o desde *En uso*.

### Más ventas y control

- **Promociones**: porcentaje, lleva X paga Y (2x1) y precio por cantidad (3 por B/.1.00), por producto o categoría, con vigencia. El punto de venta las aplica solo.
- **Puntos de lealtad**: los clientes registrados acumulan puntos y los canjean como descuento.
- **Catálogo en línea** (`/c/tu-negocio`): tus clientes arman el pedido y te lo envían por WhatsApp.
- **Etiquetas de precio** con código de barras (se asigna un EAN-13 interno a los productos sin código).
- **Conteo físico** de inventario: se escanea el anaquel y se ajustan las diferencias con su motivo.

### Lo que ofrece la competencia

Plan y alcance en [`docs/plan-funciones-competencia.md`](docs/plan-funciones-competencia.md).

- **Reporte mensual de ITBMS/IVA** por tasa (base e impuesto, devoluciones como nota de crédito) con CSV para la declaración.
- **Desempeño por cajero**: ventas, descuentos manuales, cancelaciones, devoluciones y faltantes de caja.
- **Pantalla para el cliente** (`/pantalla-cliente`) en un segundo monitor o tableta: productos, ahorro, total y QR de Yappy.
- **Conciliación bancaria**: se sube el estado de cuenta en CSV y se cruza con las ventas de Yappy, transferencia o tarjeta.
- **Pedidos en línea**: el catálogo guarda los pedidos en una bandeja con estados y se cobran desde el punto de venta.
- **Órdenes de compra** (enviadas por WhatsApp, recepción parcial) y **traspasos entre sucursales**.
- **Recargas y pago de servicios**: el efectivo cuadra en la caja y la comisión cuenta como ganancia.
- **Vales (tarjetas de regalo)** imprimibles con código de barras, como forma de pago.
- **Variantes** (talla, color) y **extras con precio** ("Queso +0.50").
- **Modo restaurante**: cuentas abiertas por mesa y **pantalla de cocina** (`/cocina`).

### Prioridades de la investigación

Cada prioridad llega en su propio PR, con su plan en `docs/`.

- **Recetas e insumos** ([`docs/plan-recetas.md`](docs/plan-recetas.md)):
  - Cada plato descuenta sus insumos al venderse. La receta muestra el costo por plato y el margen.
  - Pestaña *Insumos* en Inventario y reporte de *Merma* valorado a costo.
  - *Qué comprar* incluye los insumos.
- **Cuentas por pagar a proveedores** ([`docs/plan-cuentas-por-pagar.md`](docs/plan-cuentas-por-pagar.md)):
  - Compras a crédito (también al recibir una orden de compra) y facturas registradas a mano.
  - Abonos en efectivo desde la caja o por banco.
  - Antigüedad de saldos y estado de cuenta por proveedor.
  - Lo que vence esta semana aparece en el tablero y en las alertas diarias.
  - Cada compra guarda su ITBMS para el crédito fiscal.
- **Pagos divididos** ([`docs/plan-pagos-divididos.md`](docs/plan-pagos-divididos.md)):
  - Una venta se cobra con varias formas de pago (por ejemplo, tarjeta y efectivo, vale y efectivo, o una parte fiada).
  - El cambio sale solo del efectivo.
  - Caja, reportes, conciliación, fiado y facturas leen cada parte.
  - Las ventas anteriores se migran con un pago cada una.
- **Flujo de caja y punto de equilibrio** ([`docs/plan-flujo-equilibrio.md`](docs/plan-flujo-equilibrio.md)):
  - Gastos recurrentes que se registran solos cada mes.
  - Proyección a 30, 60 y 90 días, semana a semana: ventas, cobros de fiado, facturas por pagar, gastos fijos y compras.
  - Alerta si el saldo baja de cero.
  - Ventas necesarias para no perder, en monto y en días del mes.
- **Contabilidad automática** ([`docs/plan-contabilidad.md`](docs/plan-contabilidad.md)):
  - Los asientos se generan de las ventas, compras, pagos, gastos y caja, sin doble captura.
  - Estado de resultados, balance general (que cuadra) y flujo de efectivo.
  - Libro diario y mayor en CSV y Excel.
  - Aportes y retiros del dueño.
  - ITBMS a pagar menos el crédito fiscal.
  - Cierre de mes con reapertura registrada en la bitácora.
- **Planilla panameña** ([`docs/plan-planilla.md`](docs/plan-planilla.md)):
  - Empleados quincenales o mensuales.
  - CSS, seguro educativo, riesgos profesionales e ISR por tramos, con valores por defecto editables (verificar con el contador).
  - Décimo tercer mes en sus tres partidas, vacaciones y prima de antigüedad acumuladas.
  - Adelantos que se descuentan en la siguiente planilla y comprobantes de pago.
  - Al pagarse genera el gasto y alimenta el flujo de caja y la contabilidad.
- **Campañas por WhatsApp y cupones** ([`docs/plan-campanas.md`](docs/plan-campanas.md)):
  - Solo a clientes que aceptaron (Ley 81).
  - Segmentos: cumpleaños, clientes que no vuelven, frecuentes, con fiado vencido o por etiqueta.
  - Mensajes con `{nombre}`, `{puntos}` y `{cupón}`.
  - Envío asistido por enlace, o directo con la API de WhatsApp Business.
  - Cupones que se aplican en el punto de venta, con resultados de canjes y ventas atribuidas.
- **Balanza conectada** ([`docs/plan-balanza.md`](docs/plan-balanza.md)):
  - Balanza por USB o puerto serie en Chrome y Edge. El botón *Pesar* llena la cantidad de lo que se vende por libra o kilo.
  - Etiquetas de peso EAN-13 (prefijo 20-29) con el peso o el precio: al escanearlas se agrega el producto con su cantidad.
- **Cobro automático de la suscripción** ([`docs/plan-suscripcion.md`](docs/plan-suscripcion.md)):
  - *Mi plan*: el dueño paga en línea (Stripe Checkout o el proveedor simulado) y la tarjeta queda guardada.
  - El webhook firmado registra el pago y extiende la vigencia.
  - El cron diario avisa antes de cobrar, renueva, reintenta y suspende al pasar los días de gracia que fija el super admin.
  - Pagar reactiva el negocio.

## Requisitos

- Node.js 20.19+ (recomendado 22)
- PostgreSQL 14+ (incluye `docker-compose.yml`)

## Instalación

```bash
cp .env.example .env          # y completa JWT_SECRET
docker compose up -d          # PostgreSQL local (crea también la base de pruebas)
npm install
npm run db:migrate            # aplica las migraciones
npm run db:seed               # opcional: datos de demostración
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Cuentas de demostración (`npm run db:seed`)

| Rol    | Correo                     | Contraseña |
| ------ | -------------------------- | ---------- |
| Dueño  | `demo@comercioclaro.com`   | `demo1234` |
| Cajero | `cajero@comercioclaro.com` | `demo1234` |
| Super admin | `admin@comercioclaro.com` | `demo1234` |

El super admin entra con verificación en dos pasos: agrega a tu app de autenticación (Google Authenticator, Authy…) la clave de demostración `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` y escribe el código que muestra.

El Dueño y el Cajero tienen acceso a los cuatro negocios de ejemplo. Se cambia de negocio con el selector bajo el nombre del negocio, en la parte superior:

- **Miscelánea La Esperanza** (México): con la que se entra al iniciar sesión.
- **Minisúper El Dorado** (Panamá, capital): promoción de cerveza, puntos de lealtad y catálogo público con zonas de entrega en `/c/minisuper-el-dorado`.
- **Fonda La Chiricana** (Panamá): modo restaurante, con extras, variantes, pantalla de cocina y 25% de descuento de jubilado.
- **Abarrotería Los Santos** (Panamá, interior): venta por libra y fiado a la quincena y a la cosecha.

La interfaz en chino o inglés se elige en Configuración → Mi cuenta.

El super admin entra al panel `/admin`. En producción, el primero se nombra con `npm run admin:grant -- correo@dominio.com`.

Si tu base tiene las cuentas de demostración anteriores (`demo.pa@`, `cajero.pa@`, `demo.fonda@`, `demo.interior@`), `npm run db:seed` agrega sus negocios al Dueño y al Cajero sin borrar nada.

## Scripts

| Script               | Descripción                                                 |
| -------------------- | ----------------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo                                      |
| `npm run build`      | Compilación de producción                                   |
| `npm run lint`       | ESLint                                                      |
| `npm run typecheck`  | TypeScript                                                  |
| `npm test`           | Pruebas unitarias y de integración (Vitest)                 |
| `npm run test:e2e`   | Pruebas de punta a punta (Playwright, requiere datos demo)  |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo                       |
| `npm run db:deploy`  | Aplica migraciones en producción                            |
| `npm run db:seed`    | Datos de demostración                                       |
| `npm run admin:grant -- correo` | Nombra administrador de la plataforma (super admin) |

Las pruebas de integración usan `TEST_DATABASE_URL` (se vacía en cada prueba). Sin esa variable solo corren las unitarias.

## Producción

1. Base de datos PostgreSQL administrada (Neon, Supabase, RDS...).
2. Variables de entorno: `DATABASE_URL`, `JWT_SECRET` (mínimo 32 caracteres; sin ella la app no inicia ni valida sesiones) y `APP_URL`. Opcionales: `RESEND_API_KEY` y `EMAIL_FROM` (correos), `CRON_SECRET` (alertas), `FACTURAMA_USER`, `FACTURAMA_PASSWORD` y `FACTURAMA_SANDBOX` (CFDI México), `ALANUBE_API_URL` y `ALANUBE_TOKEN` (PAC Panamá), `YAPPY_PROVIDER=bg`, `YAPPY_MERCHANT_ID`, `YAPPY_SECRET_KEY`, `YAPPY_DOMAIN` y `YAPPY_API_URL` (Yappy Comercial). Ver `.env.example`.
3. `npm run db:deploy && npm run build && npm start`.
   Después, nombra al primer super admin con `npm run admin:grant -- correo@dominio.com` y crea los planes en `/admin/planes`. Mientras no haya planes, todos los negocios tienen todas las funciones.
4. Tareas programadas (`vercel.json`): `GET /api/cron/low-stock` y `GET /api/cron/billing` (cobro de la suscripción) una vez al día, y `GET /api/cron/einvoice` cada 15 minutos para reintentar las facturas en contingencia (en Vercel, un cron más frecuente que diario requiere el plan Pro). En otro hosting, llama esas rutas con `Authorization: Bearer $CRON_SECRET`.

## Tecnologías

- [Next.js 16](https://nextjs.org/) (App Router, `proxy.ts`) y React 19
- [Prisma 7](https://www.prisma.io/) con `@prisma/adapter-pg` y PostgreSQL. Montos en `Decimal`, no en punto flotante.
- [Zod](https://zod.dev/) para validar todas las entradas
- [SWR](https://swr.vercel.app/) para datos en el cliente, IndexedDB y un service worker propio para el modo sin conexión
- [Tailwind CSS 4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Lucide](https://lucide.dev/)
- [ZXing](https://github.com/zxing-js/browser) como respaldo de `BarcodeDetector`
- Vitest, Playwright y GitHub Actions

## Diseño: Sistema Claro

Toda la app usa un solo design system, Claro. Los principios, colores, tipografía, espacios, movimiento y componentes están en [`docs/design-system.md`](docs/design-system.md).

- **Colores:**
  - Verde **Canal** (`#0e7a4e`) para actuar y **Mango** (`#f4a62a`) para destacar.
  - Fondo **Arena** y texto **Tinta**, con modo oscuro propio.
- **Tipografía:** Bricolage Grotesque en títulos y Figtree en texto y cifras, con números tabulares. Se sirven desde la app, sin Google Fonts.
- **Tacto:** controles de al menos 48 px, respuesta al presionar en 120 ms y animaciones que se apagan con "reducir movimiento".

## Accesibilidad

Objetivo: WCAG 2.2 nivel AA. `e2e/accessibility.spec.ts` revisa con axe-core todas las pantallas en modo claro y oscuro y falla ante cualquier violación.

- Contraste de al menos 4.5:1 en textos y botones (el verde Canal `#0e7a4e` da 5.4:1 con blanco; en oscuro los colores de estado se aclaran).
- Foco visible en todos los controles; los diálogos atrapan el foco, cierran con Escape y lo devuelven al botón que los abrió.
- Pestañas con flechas, Inicio y Fin; enlace "Ir al contenido"; landmarks y encabezados en orden.
- Campos con etiqueta, ayuda y error enlazados (`aria-describedby`, `aria-invalid`) y marca de obligatorio.
- El total del carrito se anuncia al lector de pantalla; el idioma de la página (`lang`) sigue al del usuario.
- Respeta "reducir movimiento" del sistema y permite zoom.

## Seguridad

- Sesiones JWT en cookie `httpOnly` y validadas en la base de datos en cada petición: cambiar la contraseña, "cerrar todas las sesiones" o quitar a un usuario invalida sus sesiones.
- Límite de intentos (guardado en la base) en inicio de sesión, registro y recuperación de contraseña.
- Los tokens de recuperación se guardan como hash SHA-256, vencen en 1 hora y se envían por correo.
- Encabezados CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS.
- Todas las consultas se filtran por negocio y rol, y los errores no exponen detalles internos.

## Estructura

```
prisma/            Esquema, migraciones y datos de demostración
src/
├── app/           Páginas (App Router) y rutas de la API
├── components/    Componentes de UI, POS, inventario, PWA
├── lib/           Utilidades compartidas (auth, validación, decimales, fechas, CSV, CFDI)
│   └── client/    Utilidades del navegador (API, formato, IndexedDB)
├── server/        Lógica de negocio (ventas, compras, inventario, caja, reportes, facturas)
└── proxy.ts       Protección de rutas
tests/             Pruebas unitarias e integración (Vitest)
e2e/               Pruebas de punta a punta (Playwright)
public/            Manifest, íconos y service worker
```

## Licencia

MIT
