# Carga masiva y acciones en lote

Objetivo: dejar de agregar los registros uno a uno. Se entrega en 4 PR:

| PR | Qué |
| --- | --- |
| 1 | Ojito para ver la contraseña (`PasswordInput`). |
| 2 | Motor de carga masiva + productos y categorías. |
| 3 | Carga masiva de clientes, proveedores, gastos y empleados. |
| 4 | Acciones en lote en el inventario (precio, categoría, stock mínimo, archivar). |

## Cómo funciona la carga masiva

1. **Datos:** se pegan filas copiadas de Excel (con los encabezados) o se sube un CSV. Hay una plantilla descargable por tipo.
2. **Columnas:** se reconocen por su nombre, sin importar acentos, mayúsculas ni el asterisco de las obligatorias. Cada columna acepta varios nombres ("Producto", "Nombre"; "Celular", "Teléfono"…). Las columnas que no se reconocen se muestran y no se usan.
3. **Vista previa:** cada fila se valida en el navegador con el mismo esquema que usa el servidor (`src/lib/bulk.ts`) y se ve lista o con su error, nombrando la columna. Se pueden ver solo las filas con errores.
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
