import { expect, test } from "@playwright/test";
import { expectAccessible, login, OWNER } from "./helpers";

// Edición masiva: los productos de la lista en una tabla; se cambian varios a la vez y se guarda al final.

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

test("subir precios en lote, editar una celda y archivar desde la tabla", async ({ page }) => {
  const tag = unique();
  await login(page, OWNER);
  const created = await page.request.post("/api/bulk/products", {
    data: {
      rows: [
        { name: `Jugo ${tag}`, price: "1.00", cost: "0.60" },
        { name: `Soda ${tag}`, price: "2.00", cost: "1.20" },
        { name: `Pan ${tag}`, price: "0.50", cost: "0.30" },
      ],
    },
  });
  expect(created.ok()).toBe(true);

  await page.goto("/inventario");
  await page.getByLabel("Buscar por nombre, código o SKU").fill(tag);
  await expect(page.getByText(`Pan ${tag}`)).toBeVisible();
  await page.getByRole("button", { name: "Editar en lote" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar productos en lote" });
  await expect(dialog.getByText("3 productos")).toBeVisible();

  // Subir 10% con redondeo a 0.05 a los tres.
  await dialog.getByLabel("Seleccionar todos").check();
  await dialog.getByLabel("Cómo").selectOption("up%");
  await dialog.getByLabel("Porcentaje").fill("10");
  await dialog.getByLabel("Redondear").selectOption("0.05");
  await dialog.getByRole("button", { name: "Aplicar a los seleccionados" }).click();
  await expect(dialog.getByLabel(`Precio de Jugo ${tag}`)).toHaveValue("1.1");
  await expect(dialog.getByLabel(`Precio de Pan ${tag}`)).toHaveValue("0.55");

  // Una celda se corrige a mano; un valor inválido bloquea el guardado.
  await dialog.getByLabel(`Precio de Soda ${tag}`).fill("abc");
  await expect(dialog.getByLabel(`Precio de Soda ${tag}`)).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByRole("button", { name: /^Guardar cambios/ })).toBeDisabled();
  await dialog.getByLabel(`Precio de Soda ${tag}`).fill("2.49");

  // Archivar solo el pan.
  await dialog.getByLabel("Seleccionar todos").uncheck();
  await dialog.getByLabel(`Seleccionar Pan ${tag}`).check();
  await dialog.getByRole("button", { name: "Archivar seleccionados" }).click();
  await expect(dialog.getByText("Se archivará")).toBeVisible();
  await expectAccessible(page);

  await dialog.getByRole("button", { name: "Guardar cambios en 3 productos" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "3 productos actualizados · 1 archivados" })).toBeVisible();
  await dialog.getByRole("button", { name: "Listo" }).click();

  await expect(page.getByText(`Pan ${tag}`)).toHaveCount(0);
  await expect(page.getByText(`Soda ${tag}`)).toBeVisible();
  await expect(page.getByText(/2\.49/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`edición masiva accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER);
    await page.goto("/inventario");
    await page.getByRole("button", { name: "Editar en lote" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar productos en lote" });
    await expect(dialog.getByLabel("Seleccionar todos")).toBeVisible();
    await expectAccessible(page);
  });
}
