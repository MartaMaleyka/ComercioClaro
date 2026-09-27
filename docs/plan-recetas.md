# Recetas e insumos

Prioridad 1 de la investigación. Las fondas, cafeterías y panaderías venden platos, pero lo que compran son insumos: pollo por libra, arroz, aceite, culantro. Sin recetas, el inventario de la cocina no cuadra y el costo real de cada plato es una suposición.

## Qué hace

- **Insumos.** Un producto marcado como insumo:
  - Se compra y lleva existencias como cualquier otro.
  - No aparece en el punto de venta ni en el catálogo en línea, y la API rechaza venderlo.
- **Receta por plato.** Se edita en *Editar producto → Mostrar receta e insumos*:
  - Lista de insumos, cada uno con su cantidad en la unidad del insumo (lb, pza, l…).
  - Porciones que rinde (opcional). Las cantidades se escriben para la olla completa y se dividen entre las porciones.
  - Costo por plato con el costo actual de los insumos, y margen contra el precio.
  - Puede ser insumo cualquier producto con existencias sin receta propia: por ejemplo, la soda de un combo.
- **Al vender** un plato con receta:
  - Se descuenta cada insumo (cantidad por porción × cantidad vendida) en lugar del plato. Cada salida queda en el kardex con la venta como referencia.
  - El costo del renglón es la suma de los insumos al costo promedio vigente, así que la utilidad bruta de los reportes es real.
  - El plato deja de llevar existencias propias al guardar su receta.
  - Los insumos pueden quedar en negativo: una venta no se detiene porque el conteo de la cocina esté atrasado. El faltante aparece en *Qué comprar* y se corrige con un conteo.
- **Cancelar y devolver** regresan los insumos en proporción a lo no devuelto o devuelto. Se usa lo que realmente se descontó en la venta (tabla `SaleItemIngredient`), aunque la receta haya cambiado después.
- **Merma.** Se registra con *Ajustar existencia* y el motivo Merma, Caducidad o Dañado. La pestaña *Insumos* tiene el botón "Registrar merma". En *Reportes → Merma* se ve lo perdido en el periodo, valorado al costo, por producto y por motivo.
- **Qué comprar** suma el consumo de los insumos por los platos vendidos en los últimos 30 días y los marca como "Insumo".
- **Pestaña Inventario → Insumos:**
  - Existencia, costo y en cuántas recetas se usa cada insumo.
  - Platos con su costo, margen y para cuántos alcanza la existencia actual.

## Plan

- Función `recipes` ("Recetas e insumos"). Está incluida en el plan Empresarial.
- Sin la función, el plato se vende como antes: no se descuentan insumos y las recetas se conservan.
- El reporte de merma es básico: está disponible en todos los planes.

## Datos

| Modelo | Para qué |
| --- | --- |
| `Product.isIngredient` | Insumo que no se vende en la caja. |
| `Product.recipeYield` | Porciones que rinde la receta. |
| `RecipeItem` | Insumo y cantidad de la receta de un plato (único por plato e insumo). |
| `SaleItemIngredient` | Lo que se descontó de cada insumo en un renglón vendido, con su costo. |

Migración `20260930010000_recetas`. Solo agrega columnas y tablas.

## Límites conocidos

- No hay conversión de unidades: la cantidad de la receta va en la unidad del insumo (si el pollo se compra por libra, la receta lleva libras).
- No hay recetas anidadas: una salsa preparada no puede ser insumo de otro plato si también tiene receta.
- Los extras (p. ej. "+Arroz") no descuentan insumos; se cobran como hasta ahora.

## Pruebas

- Integración (`tests/integration/recetas.test.ts`):
  - La venta de un plato descuenta sus insumos y toma su costo.
  - Cancelar y devolver regresan los insumos.
  - Los insumos no se venden en la caja y pueden quedar en negativo.
  - Sin la función, el plato se vende sin descontar insumos.
  - Validación de la receta.
  - *Qué comprar* cuenta el consumo, y la merma se valora a costo.
- De punta a punta (`e2e/recetas.spec.ts`): venta de un plato en la fonda de demostración, reporte de merma y revisión con axe (modo claro y oscuro) de la pestaña Insumos, el reporte y el editor de receta.
