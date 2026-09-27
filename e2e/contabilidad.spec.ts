import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("estados financieros cuadran y los libros se descargan", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.getByRole("link", { name: "Contabilidad" }).first().click();
  await expect(page.getByRole("heading", { name: "Balance general" })).toBeVisible();
  await expect(page.getByText("Cuadra", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estado de resultados" })).toBeVisible();

  const excel = await page.request.get(page.url().replace(/\/contabilidad.*/, "/api/accounting/journal?format=xls"));
  expect(excel.headers()["content-type"]).toContain("application/vnd.ms-excel");
  expect(await excel.text()).toContain("Libro mayor");

  await page.getByRole("tab", { name: "Libro diario" }).click();
  await expect(page.getByRole("table", { name: "Libro diario" })).toBeVisible();
  await page.getByRole("tab", { name: "Libro mayor" }).click();
  await page.getByRole("button", { name: /1101\s*Caja/ }).click();
  await expect(page.getByRole("dialog", { name: /1101 · Caja/ })).toBeVisible();
});

test("retiro del dueño y cierre de mes", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/contabilidad?tab=dueno");
  await expect(page.getByText("Capital para abrir el minisúper")).toBeVisible();
  const note = `E2E-${Date.now()}`;
  await page.getByRole("button", { name: "Aporte o retiro" }).click();
  const dialog = page.getByRole("dialog", { name: "Aporte o retiro del dueño" });
  await dialog.getByLabel("Monto").fill("10");
  await dialog.getByLabel("Forma").selectOption("TRANSFER");
  await dialog.getByLabel("Notas").fill(note);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(note)).toBeVisible();

  await page.getByRole("tab", { name: "Cierre de mes" }).click();
  await expect(page.getByText(/Cerrado el/).first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`contabilidad accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    // Revisa cinco pantallas, entre ellas el libro diario completo.
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.panama);
    for (const tab of ["", "?tab=diario", "?tab=mayor", "?tab=dueno", "?tab=cierre"]) {
      await page.goto(`/contabilidad${tab}`);
      await expect(page.getByRole("tab", { selected: true })).toBeVisible();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
      await expectAccessible(page);
    }
    await page.goto("/reportes");
    await page.getByRole("tab", { name: "Impuestos" }).click();
    await expect(page.getByText("Crédito fiscal (compras)")).toBeVisible();
    await expectAccessible(page);
  });
}
