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

test("clientes, proveedores y gastos se cargan desde la misma ventana", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  const tag = unique();
  await login(page, OWNER);

  await page.goto("/clientes");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  let dialog = page.getByRole("dialog", { name: "Carga masiva de clientes" });
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(`Nombre,Celular,Límite de crédito,Acepta mensajes\nJuana ${tag},6000-${tag.slice(-4)},50,sí\nPedro ${tag},,,no\n`);
  await dialog.getByRole("button", { name: "Importar 2 filas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "2 nuevos" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Juana ${tag}`)).toBeVisible();

  await page.goto("/proveedores");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  dialog = page.getByRole("dialog", { name: "Carga masiva de proveedores" });
  await dialog.getByLabel("Pega aquí tus filas").fill(`Proveedor;Días de crédito\nDistribuidora ${tag};45\n`);
  await dialog.getByRole("button", { name: "Importar 1 fila" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Distribuidora ${tag}`)).toBeVisible();

  await page.goto("/gastos");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  dialog = page.getByRole("dialog", { name: "Carga masiva de gastos" });
  await expect(dialog.getByText(/no salen de la caja abierta/)).toBeVisible();
  const today = new Date();
  const day = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(`Fecha\tCategoría\tMonto\tDescripción\n${day}\tLuz\tB/. 85.40\tRecibo ${tag}\n${day}\tAgua\t\tSin monto\n`);
  await expect(dialog.getByText("Monto: Debe ser un número").or(dialog.getByText(/^Monto:/))).toBeVisible();
  await dialog.getByRole("button", { name: "Importar 1 fila lista" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos" })).toBeVisible();
});

test("empleados de la planilla en lote", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  const tag = unique();
  await login(page, OWNER, BUSINESS.fonda);
  await page.goto("/planilla");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de empleados" });
  await dialog
    .getByLabel("Pega aquí tus filas")
    .fill(`Nombre\tCédula\tSalario\tFecha de ingreso\tFrecuencia\nAna ${tag}\t8-${tag.slice(-3)}-1\t650\t01/02/2025\tquincenal\n`);
  await dialog.getByRole("button", { name: "Importar 1 fila" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText(`Ana ${tag}`)).toBeVisible();
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
