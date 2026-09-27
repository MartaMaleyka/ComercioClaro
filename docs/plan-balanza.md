# Balanza conectada y etiquetas de peso

Prioridad 8 de la investigación. En el minisúper y la carnicería se vende arroz, queso, jamón y carne por libra. Hasta ahora el cajero leía la balanza y escribía el peso a mano. Eso es lento y se presta a errores y a regalar mercancía.

Es una función básica: no depende del plan.

## Balanza conectada a la computadora

*Configuración → Balanza*. Solo aparece en los navegadores que permiten el puerto serie (Web Serial): **Chrome o Edge en una computadora**. En los demás no se muestra.

- **Conectar balanza:** el navegador pide elegir el puerto (USB, o RS-232 con un adaptador). La autorización queda guardada en esa computadora.
- **Velocidad (baudios):** 2400, 4800, 9600 (la más común) o 19200.
- **Protocolo:**
  - *Se pide el peso:* se envía `W` y la balanza responde. Sirve para Toledo 8217, CAS y la mayoría.
  - *La balanza envía el peso sola:* modo continuo.
- **Probar lectura:** muestra el peso leído para comprobar la conexión.

La velocidad y el protocolo se guardan **en esa computadora** (almacenamiento local del navegador), porque la balanza está conectada a ella.

### En el punto de venta

Los productos por libra, kilo, gramo u onza muestran el botón **Pesar** en el carrito cuando hay una balanza conectada.

- Se espera hasta 3 segundos una lectura **estable**. Las lecturas marcadas como inestables (`US` o `?`) se ignoran.
- Si la balanza pesa en otra unidad, el peso se convierte a la unidad del producto (por ejemplo, kilos a libras).

Formatos de lectura reconocidos: `ST,GS,+  1.234kg`, `␂ 001.25 lb`, `0,500` (sin unidad = la del producto).

## Etiquetas de peso (balanza etiquetadora)

Las balanzas que imprimen etiquetas usan un EAN-13 que empieza con **20 a 29**:

```
2 X PPPPP VVVVV C
│ │ │     │     └ dígito verificador
│ │ │     └ peso o precio (con decimales implícitos)
│ │ └ PLU: el código del producto en la balanza
│ └ segundo dígito del prefijo (0-9)
└ prefijo de uso interno
```

Al escanear la etiqueta (o escribirla en la búsqueda y dar Enter), se agrega el producto con su cantidad.

- **El PLU** es el **código de barras o el SKU** del producto, con o sin ceros a la izquierda (`00406` o `406`).
- **La etiqueta trae el peso:** la cantidad es el peso, convertido de la unidad de la etiqueta a la del producto.
- **La etiqueta trae el precio:** la cantidad es el precio impreso entre el precio del producto.
- Si el producto no se vende por peso, se avisa que revisen su unidad.
- Los códigos exactos (código de barras o SKU del producto) tienen prioridad sobre la etiqueta.

Formato (para todo el negocio, en *Configuración → Balanza*):

| Campo | Por defecto |
| --- | --- |
| Reconocer etiquetas de peso al escanear | Sí |
| La etiqueta trae | El peso |
| Dígitos del PLU | 5 |
| Unidad del peso | Libras en Panamá, kilos en los demás países |
| Decimales | 3 (milésimas); para el precio, 2 (centavos) |

Ejemplo con el formato por defecto en Panamá: `2000406012506` = PLU `00406`, 1.250 lb.

## Datos

- `Business.weightBarcode` (JSON): formato de las etiquetas. Vacío = valores por defecto del país.
- `PUT /api/business/weight-barcode` (dueño) guarda el formato y queda en la bitácora (`business.weightBarcode`).
- La sesión expone el formato ya completado con los valores por defecto (`business.weightBarcode`).

## Código

- `src/lib/scale.ts`: lectura de la balanza, conversión de unidades y etiquetas de peso (sin navegador; con pruebas).
- `src/lib/client/scale.ts`: conexión por Web Serial y el hook `useScale()`.
- `src/components/settings/ScaleSettingsCard.tsx`: configuración.
- Punto de venta: `addByCode` y el botón *Pesar* en `src/app/(app)/ventas/page.tsx`.

## Demostración

En *Minisúper El Dorado* está **Jamón de pierna (libra)** con SKU `00406`. Escanear `2000406012506` agrega 1.25 lb.

## Pruebas

- Unitarias (`tests/unit/balanza.test.ts`): lecturas, conversiones, EAN-13, PLU y cantidades.
- Integración (`tests/integration/balanza.test.ts`): formato guardado y venta de la cantidad de una etiqueta.
- E2E (`e2e/balanza.spec.ts`), con una balanza simulada por Web Serial: la etiqueta agrega 1.25 lb, *Pesar* cambia a 2.5 lb, y la configuración pasa axe en modo claro y oscuro.

## Pendiente

- Safari y Firefox no tienen Web Serial. Para esos navegadores haría falta un programa puente local.
- Las balanzas por Bluetooth o de red no se conectan todavía.
