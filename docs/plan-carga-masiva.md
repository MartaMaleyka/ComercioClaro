# Carga masiva y acciones en lote

Objetivo: dejar de agregar los registros uno a uno. Se entrega en 4 PR:

| PR | Qué |
| --- | --- |
| 1 | Ojito para ver la contraseña (`PasswordInput`). |
| 2 | Motor de carga masiva + productos y categorías. |
| 3 | Carga masiva de clientes, proveedores, gastos y empleados. |
| 4 | Acciones en lote en el inventario (precio, categoría, stock mínimo, archivar). |

## Cómo funciona la carga masiva

1. **Datos:** una tabla editable tipo hoja de cálculo. Se escribe fila por fila ("Agregar fila", "Agregar 10 filas", Enter baja a la fila siguiente y siempre queda una fila vacía al final), se pega desde Excel en cualquier celda (con encabezados cada columna cae en su lugar; sin ellos se llena desde la celda actual) o se sube un CSV que llena la tabla. Hay una plantilla descargable por tipo. Cada fila se revisa mientras se escribe y la celda con el error queda marcada; al guardar, las filas pendientes se pueden corregir en la misma tabla.
2. **Columnas:** se reconocen por su nombre, sin importar acentos, mayúsculas ni el asterisco de las obligatorias. Cada columna acepta varios nombres ("Producto", "Nombre"; "Celular", "Teléfono"…). Las columnas que no se reconocen se muestran y no se usan.
3. **Vista previa:** cada fila se valida en el navegador con el mismo esquema que usa el servidor (`src/lib/bulk.ts`) y se ve lista o con su error, nombrando la columna.
4. **Guardado:**
   - Se mandan solo las filas listas, con su número de fila.
   - El servidor (`src/server/bulk.ts`) vuelve a validar y guarda fila por fila: una fila con error no detiene a las demás.
   - El resultado dice cuántas se crearon, cuántas se actualizaron y cuáles fallaron, con el número de fila de la hoja.
5. **Sin duplicar:** si el registro ya existe, se actualiza, y solo cambian las columnas que trae el archivo. Cómo se reconoce cada tipo:

   | Tipo | Se reconoce por |
   | --- | --- |
   | Productos | Código de barras o, si no hay, nombre |
   | Categorías | Nombre (las repetidas se omiten) |
   | Clientes | Teléfono o, si no hay, nombre |
   | Proveedores | Nombre |
   | Empleados | Cédula o, si no hay, nombre |
   | Gastos | No se combinan: cada fila es un gasto |

6. **Lectura de celdas:**
   - Montos con `$`, `B/.` o comas.
   - Fechas `dd/mm/aaaa` o `aaaa-mm-dd`.
   - "sí/no".
   - Unidades en palabras ("libra", "pza").
   - Impuestos como `7%` o "exento".
   - Formas de pago en palabras.
7. **Límites:**
   - 2,000 filas y 2 MB por carga.
   - Solo el dueño puede cargar.
   - Empleados requiere la función de planilla.
8. **Auditoría:** cada carga deja una entrada `bulk.import` en la bitácora con los totales, y cada registro su propia entrada.

### Decisiones

- Los **gastos** cargados en lote son históricos: no salen de la caja abierta, respetan el cierre de mes y no aceptan fechas futuras.
- La **existencia** de un producto que ya existe no se cambia desde la carga: se ajusta con un conteo físico, para que quede en el kardex.
- El CSV de productos que ya existía (`/api/products/import`) ahora usa la misma lectura y validación.

## Edición en lote del inventario (PR 4)

La misma idea de tabla, para los productos que ya existen:

1. **Qué productos:** el botón *Editar en lote* trae a una tabla todos los productos que coinciden con los filtros de la lista (búsqueda, categoría, bajo inventario, archivados), hasta 2,000.
2. **Edición directa:** se edita en la celda el nombre, la categoría, el costo, el precio, el precio de mayoreo y el stock mínimo. El margen se recalcula al escribir. Las celdas cambiadas se marcan en mango y muestran el valor anterior; las inválidas, en rojo.
3. **Cambiar varios a la vez:** se marcan filas (o todas) y se aplica:
   - Precio, costo o precio de mayoreo: subir o bajar un %, sumar, restar o fijar un valor, con redondeo a 0.05, 0.10, 0.25, 0.50, al entero o para que termine en .99.
   - Stock mínimo: los mismos ajustes, sin redondeo.
   - Categoría: la misma para todas.
   - Archivar o restaurar.

   Los cambios se ven en la tabla antes de guardar (`src/lib/bulk-edit.ts`, código puro con pruebas).
4. **Guardado:** *Guardar cambios en N productos* manda solo lo que cambió de cada fila a `POST /api/products/bulk`. El servidor valida cada fila y guarda producto por producto; un error no detiene al resto. Solo el dueño. Bitácora `bulk.update` con los totales, y cada producto su propia entrada.
5. **La existencia no se edita aquí:** se ajusta con un conteo, para que quede en el kardex.

### Arreglo incluido

Actualizar un producto con solo algunos campos (por ejemplo *Restaurar*) volvía a sus valores por defecto el costo, el stock mínimo, la unidad, el IEPS y las claves SAT, porque zod 4 aplica los `default()` también en `.partial()`. El esquema de actualización ya no tiene valores por defecto.
