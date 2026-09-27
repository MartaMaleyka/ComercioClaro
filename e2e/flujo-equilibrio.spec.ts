import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("flujo de caja proyectado y punto de equilibrio", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/reportes");
  await page.getByRole("tab", { name: "Flujo y equilibrio" }).click();
  await expect(page.getByText(/Para cubrir tus gastos fijos necesitas vender B\/\./)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Avance hacia el punto de equilibrio" })).toBeVisible();
  const table = page.getByRole("table", { name: "Flujo de caja proyectado" });
  await expect(table.getByRole("row")).toHaveCount(6);
  await page.getByRole("radio", { name: "90 días" }).click();
  await expect(table.getByRole("row")).toHaveCount(14);
  // Un saldo inicial negativo muestra la alerta.
  await page.getByLabel("Saldo inicial").fill("-5000");
  await expect(page.getByRole("alert").filter({ hasText: "El saldo quedaría en" })).toBeVisible();
});

test("gasto recurrente: se crea, aparece y se elimina", async ({ page }) => {
  const note = `E2E-${Date.now()}`;
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/gastos?tab=recurrentes");
  await expect(page.getByText("Renta", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gasto recurrente" }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo gasto recurrente" });
  await dialog.getByLabel("Categoría").selectOption("Agua");
  await dialog.getByLabel("Monto").fill("22.50");
  await dialog.getByLabel("Día del mes").fill("28");
  await dialog.getByLabel("Descripción").fill(note);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Gasto recurrente guardado")).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: note });
  await expect(item.getByText(/Cada mes el día 28/)).toBeVisible();
  await item.getByRole("button", { name: "Eliminar Agua" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(item).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`flujo y gastos recurrentes accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.panama);
    await page.goto("/reportes");
    await page.getByRole("tab", { name: "Flujo y equilibrio" }).click();
    await expect(page.getByRole("table", { name: "Flujo de caja proyectado" })).toBeVisible();
    await expectAccessible(page);
    await expectAccessible(page, "/gastos?tab=recurrentes");
    await page.getByRole("button", { name: "Gasto recurrente" }).click();
    await expectAccessible(page);
  });
}
