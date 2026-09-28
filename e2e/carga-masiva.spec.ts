import { expect, test } from "@playwright/test";
import { expectAccessible, login, OWNER } from "./helpers";

// Carga masiva: una tabla donde se escribe fila por fila (o se pega desde Excel) y se guardan solo las filas listas.

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** Pega texto en una celda como lo haría Excel (separado por tabulaciones). */
async function pasteInto(cell: import("@playwright/test").Locator, text: string) {
  await cell.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test("escribir productos en la tabla, agregar filas y guardar solo las filas listas", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/inventario");
  await page.getByRole("button", { name: "Carga masiva" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de productos" });
  await expect(dialog.getByRole("button", { name: /^Importar/ })).toBeDisabled();
  await expect(dialog.getByLabel(/^Nombre fila \d+$/)).toHaveCount(5);

  await dialog.getByLabel("Nombre fila 1").fill(`Jugo ${tag}`);
  await dialog.getByLabel("Precio fila 1").fill("$1.25");
  await dialog.getByLabel("Categoría fila 1").fill(`Bebidas ${tag}`);
  // Enter baja a la fila siguiente en la misma columna.
  await dialog.getByLabel("Categoría fila 1").press("Enter");
  await expect(dialog.getByLabel("Categoría fila 2")).toBeFocused();
  await dialog.getByLabel("Nombre fila 2").fill(`Galleta ${tag}`);
  await dialog.getByLabel("Precio fila 2").fill("0.80");
  await dialog.getByLabel("Nombre fila 3").fill(`Sin precio ${tag}`);
  await dialog.getByLabel("Precio fila 3").fill("abc");
  await expect(dialog.getByLabel("Precio fila 3")).toHaveAttribute("aria-invalid", "true");

  // Las columnas que no se ven de entrada se abren con un botón.
  await expect(dialog.getByLabel("Existencia fila 1")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Ver todas las columnas/ }).click();
  await dialog.getByLabel("Existencia fila 1").fill("12");

  await dialog.getByRole("button", { name: "Agregar fila" }).click();
  await expect(dialog.getByLabel(/^Nombre fila \d+$/)).toHaveCount(6);
  await dialog.getByLabel("Nombre fila 6").fill(`Borrar ${tag}`);
  await dialog.getByRole("button", { name: "Quitar fila 6" }).click();

  await expect(dialog.getByText("3 filas")).toBeVisible();
  await expect(dialog.getByText("2 listas")).toBeVisible();
  await expect(dialog.getByText("1 con errores")).toBeVisible();
  await expect(dialog.getByText("Precio: Debe ser un número")).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Importar 2 filas listas" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "2 nuevos · 0 actualizados" })).toBeVisible();
  await expect(dialog.getByText("Fila 3: Precio: Debe ser un número")).toBeVisible();
  // Se vuelve a la tabla solo con la fila pendiente para corregirla.
  await dialog.getByRole("button", { name: "Corregir las que faltaron" }).click();
  await expect(dialog.getByLabel("Nombre fila 1")).toHaveValue(`Sin precio ${tag}`);
  await dialog.getByLabel("Precio fila 1").fill("2");
  await dialog.getByRole("button", { name: "Importar 1 fila" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "1 nuevos · 0 actualizados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();

  await page.getByLabel("Buscar por nombre, código o SKU").fill(tag);
  await expect(page.getByText(`Jugo ${tag}`)).toBeVisible();
  await expect(page.getByText(`Galleta ${tag}`)).toBeVisible();
  await expect(page.getByText(`Sin precio ${tag}`)).toBeVisible();
  await expect(page.getByText(`Borrar ${tag}`)).toHaveCount(0);
});

test("pegar categorías desde Excel en la tabla sin duplicar las que ya existen", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  await page.goto("/inventario?tab=categorias");
  await page.getByRole("button", { name: "Agregar varias" }).click();
  const dialog = page.getByRole("dialog", { name: "Carga masiva de categorías" });
  await pasteInto(dialog.getByLabel("Nombre fila 1"), `Nombre\nFrutas ${tag}\nVerduras ${tag}\nfrutas ${tag}\n`);
  await expect(dialog.getByLabel("Nombre fila 3")).toHaveValue(`frutas ${tag}`);
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
