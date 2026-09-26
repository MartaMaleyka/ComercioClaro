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
- **Yappy** como forma de pago: QR o directorio del comercio en el punto de venta, número de operación para conciliar, filtro en el historial y separación en el corte de caja.
- **Comisiones por medio de pago** (Yappy 1.07%, tarjeta y transferencia configurables) y ganancia después de comisiones en los reportes.
- **Fiado con plazo**: días de crédito por cliente (15 por defecto), vencimientos, saldo vencido con días de atraso (los abonos se aplican FIFO) y recordatorio por WhatsApp.
- **Factura electrónica DGI**: monitor de los límites del facturador gratuito (B/.36,000 al año y 100 documentos al mes, Resolución 201-6299) con aviso al 80% y registro del **CUFE** de las facturas emitidas en la DGI o un PAC.
- **Compra por caja, venta suelta** (unidades por empaque) y **pedido al distribuidor por WhatsApp** desde "Qué comprar".
- **Interfaz en chino simplificado e inglés** (piloto: menú, punto de venta y caja), elegible por usuario.

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
| Dueño (Panamá)  | `demo.pa@comercioclaro.com`   | `demo1234` |
| Cajero (Panamá, interfaz en chino) | `cajero.pa@comercioclaro.com` | `demo1234` |

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

Las pruebas de integración usan `TEST_DATABASE_URL` (se vacía en cada prueba). Sin esa variable solo corren las unitarias.

## Producción

1. Base de datos PostgreSQL administrada (Neon, Supabase, RDS...).
2. Variables de entorno: `DATABASE_URL`, `JWT_SECRET` (mínimo 32 caracteres; sin ella la app no inicia ni valida sesiones) y `APP_URL`. Opcionales: `RESEND_API_KEY` y `EMAIL_FROM` (correos), `CRON_SECRET` (alertas), `FACTURAMA_USER`, `FACTURAMA_PASSWORD` y `FACTURAMA_SANDBOX` (facturación).
3. `npm run db:deploy && npm run build && npm start`.
4. Alertas diarias: `vercel.json` ya programa `GET /api/cron/low-stock`. En otro hosting, llama esa ruta una vez al día con `Authorization: Bearer $CRON_SECRET`.

## Tecnologías

- [Next.js 16](https://nextjs.org/) (App Router, `proxy.ts`) y React 19
- [Prisma 7](https://www.prisma.io/) con `@prisma/adapter-pg` y PostgreSQL. Montos en `Decimal`, no en punto flotante.
- [Zod](https://zod.dev/) para validar todas las entradas
- [SWR](https://swr.vercel.app/) para datos en el cliente, IndexedDB y un service worker propio para el modo sin conexión
- [Tailwind CSS 4](https://tailwindcss.com/), [Recharts](https://recharts.org/), [Lucide](https://lucide.dev/)
- [ZXing](https://github.com/zxing-js/browser) como respaldo de `BarcodeDetector`
- Vitest, Playwright y GitHub Actions

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
