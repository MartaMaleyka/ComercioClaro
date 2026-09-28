import { expect, test } from "@playwright/test";
import { BUSINESS, expectAccessible, login, OWNER } from "./helpers";

// Carga masiva: se pega desde Excel, se ve la vista previa fila por fila y se guardan solo las filas listas.

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

test("pegar productos desde Excel, revisar la vista previa y guardar las filas listas", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Carga masiva" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de productos" });
  await expect(dialog.getByRole("button", { name: /^Importar/ })).toBeDisabled();

  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(
      `Nombre\tPrecio\tCategoría\tExistencia\nJugo ${tag}\t$1.25\tBebidas ${tag}\t12\nGalleta ${tag}\t0.80\tBebidas ${tag}\t30\nSin precio ${tag}\tabc\t\t\n`
    );
  await expect(dialog.getByText("3 filas")).toBeVisible();
  await expect(dialog.getByText("2 listas")).toBeVisible();
  await expect(dialog.getByText("1 con errores")).toBeVisible();
  await expect(dialog.getByText("Precio: Debe ser un número")).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Importar 2 filas listas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "2 nuevos · 0 actualizados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();

  await page.getByLabel("Buscar por nombre, código o SKU").fill(tag);
  await expect(page.getByText(`Jugo ${tag}`)).toBeVisible();
  await expect(page.getByText(`Galleta ${tag}`)).toBeVisible();
  await expect(page.getByText(`Sin precio ${tag}`)).toHaveCount(0);
});

test("agregar varias categorías de una vez sin duplicar las que ya existen", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/inventario?tab=categorias");
  await page.getByRole("button", { name: "Agregar varias" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de categorías" });
  await dialog.getByLabel("Pega aquí tus filas").fill(`Nombre\nFrutas ${tag}\nVerduras ${tag}\nfrutas ${tag}\n`);
  await dialog.getByRole("button", { name: "Importar 3 filas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "2 nuevos · 0 actualizados · 1 ya existían" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Verduras ${tag}`)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`carga masiva accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER);
    await page.goto("/inventario?tab=importar");
    await page.getByRole("button", { name: "Abrir carga masiva" }).click();
    await expect(page.getByRole("dialog", { name: "Carga masiva de productos" })).toBeVisible();
    await expectAccessible(page);
  });
}

// Clientes, proveedores, gastos y empleados usan la misma ventana: se pega, se revisa y se guarda.

test("clientes: pegar con otros nombres de columna y guardar", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de clientes" });
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(`Cliente\tCelular\tLímite\nRosa ${tag}\t6${tag.slice(-3)}-0001\t$40\nLuis ${tag}\t\t\n`);
  await expect(dialog.getByText("2 listas")).toBeVisible();
  await dialog.getByRole("button", { name: "Importar 2 filas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "2 nuevos · 0 actualizados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await page.getByPlaceholder(/Buscar/).first().fill(tag);
  await expect(page.getByText(`Rosa ${tag}`)).toBeVisible();
});

test("proveedores: el segundo archivo actualiza en lugar de duplicar", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/proveedores");
  for (const [rows, expected] of [
    [`Proveedor\tDías de crédito\nDistri ${tag}\t45\n`, "1 nuevos · 0 actualizados"],
    [`Nombre\tTeléfono\ndistri ${tag}\t6700-0000\n`, "0 nuevos · 1 actualizados"],
  ] as const) {
    await page.getByRole("button", { name: "Carga masiva" }).click();
    const dialog = page.getByRole("dialog", { name: "Carga masiva de proveedores" });
    await dialog.getByLabel("Pega aquí tus filas").fill(rows);
    await dialog.getByRole("button", { name: "Importar 1 filas" }).click();
    await expect(dialog.getByRole("status").filter({ hasText: expected })).toBeVisible();
    await dialog.getByRole("button", { name: "Listo" }).click();
  }
  await page.getByPlaceholder("Buscar proveedor").fill(tag);
  await expect(page.getByText(`Distri ${tag}`)).toHaveCount(1);
});

test("gastos: se avisa que son gastos pasados y se guardan con la forma de pago en palabras", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/gastos");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de gastos" });
  await expect(dialog.getByRole("note")).toContainText("no salen de la caja abierta");
  const today = new Date();
  const day = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(`Fecha\tTipo\tMonto\tForma de pago\tConcepto\n${day}\tLuz\t$12.50\tTarjeta de débito\tRecibo ${tag}\n`);
  await expect(dialog.getByText("1 listas")).toBeVisible();
  await dialog.getByRole("button", { name: "Importar 1 filas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos · 0 actualizados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Recibo ${tag}`)).toBeVisible();
});

test("empleados: frecuencia en palabras y error nombrando la columna", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  const tag = unique();
  await login(page, OWNER, BUSINESS.fonda);
  await page.goto("/planilla");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de empleados" });
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(
      `Nombre\tSalario\tFecha de ingreso\tFrecuencia\nMarta ${tag}\t700\t01/02/2025\tcada mes\nOtro ${tag}\t700\t01/02/2025\tsemanal\n`
    );
  await expect(dialog.getByText("Frecuencia: Frecuencia inválida: usa quincenal o mensual")).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Importar 1 filas listas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos · 0 actualizados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Marta ${tag}`)).toBeVisible();
});

// Acciones en lote del inventario: se eligen productos y se cambia el precio, la categoría o se archivan.

test("acciones en lote: subir el precio con vista previa, mover de categoría, archivar y restaurar", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  for (const [name, price] of [
    [`Lote A ${tag}`, 10],
    [`Lote B ${tag}`, 20],
  ] as const) {
    const res = await page.request.post("/api/products", { data: { name, price, stock: 5 } });
    expect(res.ok()).toBe(true);
  }
  const category = await (await page.request.post("/api/categories", { data: { name: `Lote ${tag}` } })).json();

  await page.goto("/inventario");
  await page.getByLabel("Buscar por nombre, código o SKU").fill(tag);
  await expect(page.getByText(`Lote B ${tag}`)).toBeVisible();
  await page.getByLabel("Seleccionar todos (2)").check();
  const bar = page.getByRole("region", { name: "Acciones en lote" });
  await expect(bar.getByText("2 seleccionados")).toBeVisible();
  await expectAccessible(page);

  await bar.getByRole("button", { name: "Precio" }).click();
  const priceDialog = page.getByRole("dialog", { name: "Cambiar el precio de 2 productos" });
  await priceDialog.getByLabel("Porcentaje").fill("10");
  await expect(priceDialog.getByText("22.00")).toBeVisible();
  await expectAccessible(page);
  await priceDialog.getByRole("button", { name: "Cambiar 2 precios" }).click();
  await expect(priceDialog).toBeHidden();
  await expect(page.getByText(/\$11\.00/)).toBeVisible();
  await expect(page.getByText(/\$22\.00/)).toBeVisible();

  await page.getByLabel(`Seleccionar Lote A ${tag}`).check();
  await page.getByLabel(`Seleccionar Lote B ${tag}`).check();
  await bar.getByRole("button", { name: "Categoría" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Cambiar la categoría de 2 productos" });
  await categoryDialog.getByLabel("Categoría nueva").selectOption(category.id);
  await categoryDialog.getByRole("button", { name: "Mover 2 productos" }).click();
  await expect(categoryDialog).toBeHidden();
  const moved = await (await page.request.get(`/api/products?search=${encodeURIComponent(tag)}`)).json();
  expect(moved.items.map((p: { categoryId: string }) => p.categoryId)).toEqual([category.id, category.id]);

  await page.getByLabel("Seleccionar todos (2)").check();
  await bar.getByRole("button", { name: "Archivar" }).click();
  await page.getByRole("dialog", { name: "Archivar 2 productos" }).getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText(`Lote A ${tag}`)).toHaveCount(0);

  await page.getByLabel("Ver archivados").check();
  await page.getByLabel("Seleccionar todos (2)").check();
  await bar.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText(`Lote A ${tag}`)).toHaveCount(0);
  await page.getByLabel("Ver archivados").uncheck();
  await expect(page.getByText(`Lote A ${tag}`)).toBeVisible();
});
