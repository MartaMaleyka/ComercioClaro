# ComercioClaro

Plataforma web para pequeños negocios (kioscos, misceláneas, tiendas, salones de belleza) que permite administrar ventas, compras, inventario y ganancias de forma simple y desde el celular.

## Funcionalidades

- **Dashboard** — Resumen de ventas, ganancias, inventario y alertas de bajo stock
- **Ventas** — Registro de ventas con actualización automática de inventario
- **Compras** — Registro de compras a proveedores
- **Inventario** — Gestión de productos, stock y alertas configurables
- **Reportes** — Gráficos de tendencias, ganancias y productos más vendidos
- **Configuración** — Perfil de usuario e información del negocio
- **Autenticación** — Registro, inicio de sesión y recuperación de contraseña

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
npm run db:push
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Cuenta de demostración (opcional)

```bash
npm run db:seed
```

- **Correo:** demo@comercioclaro.com
- **Contraseña:** demo123

## Tecnologías

- [Next.js 15](https://nextjs.org/) — Framework React con App Router
- [Prisma](https://www.prisma.io/) + SQLite — Base de datos
- [Tailwind CSS 4](https://tailwindcss.com/) — Estilos
- [Recharts](https://recharts.org/) — Gráficos
- [Lucide React](https://lucide.dev/) — Iconos

## Estructura

```
src/
├── app/           # Páginas y API routes
├── components/    # Componentes UI reutilizables
└── lib/           # Utilidades, auth y base de datos
```

## Licencia

MIT
