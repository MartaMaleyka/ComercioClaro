# Plan: ComercioClaro en la capital y en el interior de Panamá

Investigación de septiembre de 2026. Panamá no es un solo mercado. La ciudad de Panamá (con San Miguelito, Panamá Oeste y Colón) paga con Yappy y tarjeta, pide a domicilio y tiene internet. El interior (Azuero, Veraguas, Coclé, Chiriquí, Bocas, Darién y las comarcas) vive del efectivo y del fiado a la quincena o a la cosecha, y sufre cortes de señal y de luz.

## Hallazgos

| Tema | Evidencia | Qué significa para el sistema |
| --- | --- | --- |
| Conectividad | 30% de los hogares no tiene internet fijo ni móvil (Censo 2023); 63% de ellos es rural; 93% en la comarca Ngäbe Buglé. La cobertura móvil llega al 96% de la población pero solo al 68% del territorio. | Vender sin conexión durante días, no horas, y avisar cuánto falta por sincronizar. |
| Electricidad | Cortes de horas o días en el interior; en la capital los comercios tienen plantas propias. | Mismo punto: la app debe seguir vendiendo y no perder ventas. |
| Medios de pago | Yappy concentra más del 45% de las transacciones digitales, pero el interior y la informalidad siguen casi exclusivamente con efectivo. | Contar el efectivo por billetes y monedas en el corte (dólares y centésimos de balboa). |
| Unidades | Carne, queso, embutidos, legumbres y arroz se venden por libra; en el campo se compra por quintal (100 lb). | Unidad libra (y onza y galón); el quintal es una caja de 100 lb al comprar. |
| Salarios | El pago más común es quincenal: el 15 y el último día del mes. En el agro se paga al vender la cosecha. | Fiado que vence en la próxima quincena o en una fecha fija (cosecha). |
| Jubilados (Ley 6 de 1987) | Descuento obligatorio: 25% en restaurantes (consumo individual), 15% en comida rápida, 20% en medicamentos. Acodeco multa de B/.50 a B/.5,000 y tuvo 253 casos en el primer semestre de 2026. No se permite fotografiar el carné. | Descuento de jubilado configurable, que solo aplica a lo que corresponde y queda registrado para cualquier fiscalización. |
| Control de precios | El control sobre 22 productos terminó en septiembre de 2026. | No se implementa: ya no es obligatorio. |
| Entregas en la capital | El costo cambia según la zona o corregimiento, y las direcciones se dan con referencias. | Zonas de entrega con su costo en el catálogo, que se cobran como un renglón más de la venta. |

## Fases

1. **Libra, onza y galón** como unidades de venta, con venta a granel. Para Panamá, lo que se vende por peso usa libra por defecto.
2. **Descuento de jubilado (Ley 6)**:
   - Porcentaje por tipo de negocio y marca por producto (en una farmacia, solo los medicamentos).
   - Botón "Jubilado" en el punto de venta.
   - No se suma a una promoción: se aplica la que más le conviene al cliente.
   - Queda registrado en la venta y en un reporte mensual.
3. **Fiado a la quincena o a la cosecha**:
   - Plazo por cliente: días, próxima quincena (15 o fin de mes) o fecha fija.
   - En el tablero, lo que vence esta quincena.
4. **Corte de caja por denominación**: billetes de 1 a 100 y monedas de 1¢ a B/.1. La suma llena el efectivo contado y el detalle queda guardado.
5. **Interior sin señal**:
   - Días de venta sin conexión configurables: 7 en la capital, 30 en el interior.
   - Aviso de ventas guardadas en el equipo hace más de un día.
6. **Entregas en la capital**:
   - Productos sin control de existencias (servicios).
   - Zonas de entrega con costo; cada zona es un servicio que se cobra.
   - El catálogo pide la zona y el punto de referencia, y el pedido llega al punto de venta con el cargo incluido.
7. **Perfil capital o interior** en Configuración, que aplica los valores recomendados de cada fase.

## Fuera de alcance
- **Interfaz en ngäbere o guna:** requiere traductores nativos. Se deja como siguiente paso con los reportes de traducción.
- **Cobro con tarjeta en el celular y pagos divididos:** están en el plan de funciones de la competencia.

## Estado
Las siete fases están implementadas en la rama `claude/panama-capital-interior`.

- **Pruebas unitarias** de la quincena y la fecha fija: `tests/unit/panama-regiones.test.ts`.
- **Pruebas de integración**: `tests/integration/panama-regiones.test.ts`. Cubren la libra, el jubilado contra la promoción y el reporte, los plazos del fiado, el corte por denominación, los días sin conexión, los servicios sin existencias y las zonas de entrega.
- **Pruebas de punta a punta**: `e2e/regiones.spec.ts`.
- **Demo del interior**: `demo.interior@comercioclaro.com` / `demo1234`.

## Fuentes
- La Prensa: [30% de los hogares sin internet](https://www.prensa.com/economia/en-panama-30-de-los-hogares-no-cuenta-con-acceso-a-internet-fijo-o-movil/)
- Nexo: [Censo 2023, 1.19 millones sin internet en casa](https://nexo.la/censo-2023-panama-sin-internet-casa/)
- Infobae: [cortes de luz en el interior](https://www.infobae.com/america/agencias/2026/06/13/plantean-abrir-el-mercado-distribuidor-del-cuestionado-sector-electrico-de-panama/)
- Metro Libre: [pagos digitales y efectivo](https://www.metrolibre.com/economia/los-pagos-digitales-desplazan-el-efectivo-GC11138482)
- El Siglo: [venta por libras en Panamá](https://elsiglo.com.pa/economia/panama-cambia-sistema-medidas-KIES23647186)
- INEC: [precios por quintal](https://www.inec.gob.pa/archivos/P3511351-08.pdf)
- Rivermate: [pago quincenal](https://rivermate.com/es/guias/panama/salario)
- La Estrella: [descuentos de jubilados 2026](https://www.laestrella.com.pa/panama/nacional/jubilados-y-pensionados-en-panama-todos-los-descuentos-que-puedes-exigir-por-ley-en-2026-JC21549189)
- La Prensa: [multas de Acodeco por descuentos a jubilados](https://www.prensa.com/economia/descuentos-de-hasta-50-acodeco-recuerda-beneficios-para-jubilados-y-reporta-incumplimientos/)
- Acodeco: [fin del control de precios](https://www.acodeco.gob.pa/inicio/noticias-panama-5/)
- Merkapp: [zonas y costos de entrega](https://www.merkapp.com/delivery)
- Wikipedia: [monedas en circulación](https://es.wikipedia.org/wiki/Balboa_(moneda_de_Panam%C3%A1))
