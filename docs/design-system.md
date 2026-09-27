# Sistema Claro: el design system de ComercioClaro

Claro es el lenguaje visual de toda la app: punto de venta, tablero, inventario, configuración y super admin. El diseño de referencia con las pantallas interactivas está en el canvas de diseño del proyecto; este documento es la fuente de verdad para el código.

## Principios

1. **Una mano, un toque.** Todo lo que se toca mide al menos 48 px de alto (44 px en controles secundarios). Las acciones principales van abajo o a la derecha, donde llega el pulgar.
2. **El dinero siempre se lee grande.** Montos con cifras tabulares (`font-variant-numeric: tabular-nums`, activo en todo el `body`), alineados a la derecha en tablas y en grande en totales.
3. **Cada acción responde en menos de 120 ms.** Presionar hunde el control (`.press`), guardar muestra estado de carga sin mover el botón y cada resultado se confirma con un aviso.
4. **Claro y oscuro, AA siempre.** Texto normal a 4.5:1 y texto grande a 3:1 en los dos temas. Los estados llevan punto y palabra, nunca solo color.

## Color

Los nombres de Tailwind se conservan (`brand`, `slate`, `red`, `amber`) para que toda la app tome el sistema sin cambiar clases. Todos viven en `src/app/globals.css`.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `brand-600` (Canal) | `#0e7a4e` | `#0e7a4e` | Acción principal, enlaces, selección |
| `brand-700` | `#0a5e3c` | `#0a5e3c` | Hover y presionado; texto verde sobre fondo claro |
| `brand-50` | `#e8f4ec` | `#11291d` | Fondo suave de éxito o selección |
| `mango-400` | `#f4a62a` | `#f4a62a` | Destacar (con texto Tinta encima, 8.2:1) |
| `mango-700` | `#9a5b00` | `#f6cd82` | Texto de aviso |
| `slate-900` (Tinta) | `#17211b` | `#f1f4f1` | Texto principal |
| `slate-500` | `#5f6b63` | `#a3afa7` | Texto secundario (5.0:1 sobre Arena) |
| `surface-secondary` (Arena) | `#f6f4ee` | `#0e1512` | Fondo de la app |
| `surface` | `#ffffff` | `#16201b` | Tarjetas, paneles y hojas |
| `red-600` (Coral) | `#c2412d` | `#c2412d` | Peligro (blanco encima, 5.2:1) |
| `info` (Pacífico) | `#2458c6` | — | Información |

Reglas:

- El verde es para **actuar**. No lo uses para decorar.
- Mango solo como fondo con texto Tinta encima. Como texto, usa `mango-700` o `mango-800`.
- La escala `slate` es cálida (Tinta y Arena); en oscuro se invierte sola.

## Modo oscuro ("Claro de noche")

- **Capas de luz en lugar de sombras:**
  - Fondo `#0e1512`, tarjeta `#16201b` y lo que flota `#1c2822` (`bg-surface-raised`: hojas, modales, menús).
  - La barra lateral queda en Tinta.
  - Los bordes (`#2c3a33`) separan lo que en claro separa la sombra.
- **Nunca blanco puro sobre negro puro:** el texto es `#f1f4f1` (16:1); el secundario, `#a3afa7` (7.4:1).
- **El verde de acción no cambia:** blanco sobre `#0e7a4e` da 5.4:1. Los textos verde, coral y mango se aclaran, y sus fondos suaves se oscurecen.
- **Cambio a la mano:**
  - Botón *Modo oscuro / Modo claro* en la barra lateral, ícono en el encabezado del celular y del super admin.
  - Selector *Claro / Oscuro / Sistema* en el menú *Más* y en *Configuración → Mi cuenta*.
  - Por defecto sigue al sistema.
- **Transición:** fundido de 320 ms con View Transitions; con "reducir movimiento" el cambio es inmediato.
- **Barra del navegador:** el color de `theme-color` sigue al tema elegido.
- **Implementación:** `useTheme()`, `setTheme()`, `ThemeToggle` y `ThemeSwitch` en `providers/ThemeToggle.tsx`. El script `themeScript` aplica el tema antes de pintar, así no hay parpadeo.

## Tipografía

- **Bricolage Grotesque** (`font-display`, y automático en `h1` y `h2`): títulos de pantalla y de sección.
- **Figtree** (`font-sans`): todo el texto y las cifras.
- Ambas se sirven desde la propia app (`@fontsource-variable/*`), sin depender de Google Fonts.

| Estilo | Tamaño | Peso |
| --- | --- | --- |
| Display | 32–44 px | Bricolage 800 |
| Título | 20–28 px | Bricolage 700 |
| Monto grande | 32–48 px | Figtree 800 |
| Cuerpo | 16 px (14 en tablas densas) | Figtree 400/500 |
| Etiqueta | 12–13 px, mayúsculas, +0.06em | Figtree 600 |

## Espacio, forma y relieve

- Base de 4 px: 4, 8, 12, 16, 24, 32, 48 y 64.
- Radios:
  - `rounded-lg` (10 px): chips e insignias.
  - `rounded-xl` (14 px): controles.
  - `rounded-2xl` (20 px): tarjetas.
  - `rounded-3xl` (24 px): hojas y modales.
- Sombras cálidas: `shadow-sm` para tarjetas, `shadow-lg` para elementos flotantes y `shadow-xl` para hojas.

## Movimiento

| Duración | Uso |
| --- | --- |
| 120 ms | Toque, hover y cambio de estado (`.press`) |
| 200 ms | Entrada de tarjetas, hojas y avisos (`.animate-in`) |
| 360 ms | Celebración al cobrar (`animate-pop`) |

- La curva es `cubic-bezier(.2,.8,.2,1)`.
- Con "reducir movimiento" todo se desactiva (regla global en `globals.css`).

## Componentes

Viven en `src/components/ui`. Usa siempre estos en lugar de clases sueltas, así un cambio llega a toda la app.

| Componente | Archivo | Notas |
| --- | --- | --- |
| `Button` | `ui/Button.tsx` | Variantes: `primary`, `secondary`, `ghost`, `danger` y `accent` (Mango). Tamaños `sm` (36 px), `md` (48 px), `lg` (56 px) y `xl` (64 px, cobrar). Se hunde al presionar; al cargar muestra un indicador sin cambiar de tamaño. |
| `buttonStyles(variant, size)` | `ui/Button.tsx` | Las mismas clases de `Button` para enlaces (`<Link>`, `<a>`). Nunca metas un `Button` dentro de un `Link`. |
| `Input`, `Select`, `Textarea`, `Checkbox` | `ui/Input.tsx` | 48 px de alto, borde de 1.5 px y anillo verde al enfocar. El error se marca con borde coral y mensaje enlazado (`aria-describedby`). |
| `SearchBar` | `ui/SearchBar.tsx` | 48 px, lupa a la izquierda y botón para limpiar. |
| `Card` | `ui/Card.tsx` | Radio de 20 px, borde Arena y sombra suave. |
| `Badge` | `ui/Badge.tsx` | Con `dot`, el estado se lee por el punto y la palabra. |
| `Tabs` | `ui/Tabs.tsx` | Pestañas segmentadas (píldora); se recorren con flechas, Inicio y Fin. |
| `Switch`, `SegmentedControl` | `ui/Switch.tsx` | Interruptor de 48 × 28 px con perilla animada. |
| `Modal` | `ui/Modal.tsx` | Hoja desde abajo en celular (con asa) y tarjeta en escritorio. Atrapa el foco y cierra con Escape. |
| `PageHeader`, `Stat`, `Skeleton`, `ErrorState` | `ui/Misc.tsx` | Título de pantalla en Display. Los indicadores tienen cifra grande y se elevan al pasar el cursor. Con `hero`, el indicador principal de la pantalla va en verde Canal (uno por pantalla). |
| `EmptyState` | `ui/EmptyState.tsx` | Ícono en burbuja verde, título y siguiente paso. |
| Avisos (`useToast`) | `providers/ToastProvider.tsx` | Fondo Tinta con ícono de color: se leen igual en claro y oscuro. |

Colores fijos que no se invierten en oscuro: `ink`, `ink-soft` e `ink-line`. Se usan en la barra de navegación y en los avisos flotantes.
