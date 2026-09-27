import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("cobra con tarjeta y efectivo, y el detalle muestra cada pago", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/ventas");
  await page.getByRole("button", { name: /^Coca-Cola 2 L/ }).click();
  await page.getByRole("button", { name: "Dividir pago" }).click();
  const split = page.getByRole("group", { name: "Pago dividido" });
  await split.getByLabel("Forma de pago 1").selectOption({ label: "Tarjeta" });
  await split.getByLabel("Monto").fill("1");
  await split.getByLabel("Referencia de Tarjeta").fill("VISA-E2E");
  await expect(split.getByText(/Falta por cubrir B\/\.\s1\.10/)).toBeVisible();
  await split.getByLabel("Recibido").fill("5");
  await expect(split.getByText(/Cambio B\/\.\s3\.90/)).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar B\/\.\s2\.10/ }).click();
  const done = page.getByRole("dialog", { name: "¡Venta registrada!" });
  await expect(done).toBeVisible();
  await expect(done.getByText(/B\/\.\s3\.90/)).toBeVisible();

  await page.goto("/ventas/historial");
  await page.getByLabel("Forma de pago").selectOption({ label: "Mixto" });
  await page.getByRole("link").filter({ hasText: "Mixto" }).first().click();
  const payments = page.getByRole("list", { name: "Pagos" });
  await expect(payments.getByText(/Tarjeta B\/\.\s1\.00 · VISA-E2E/)).toBeVisible();
  await expect(payments.getByText(/Efectivo B\/\.\s1\.10/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`pago dividido accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.panama);
    await page.goto("/ventas");
    await page.getByRole("button", { name: /^Coca-Cola 2 L/ }).click();
    await page.getByRole("button", { name: "Dividir pago" }).click();
    await page.getByRole("button", { name: "Agregar forma de pago" }).click();
    await expectAccessible(page);
  });
}
