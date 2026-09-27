import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login, loginAdmin } from "./helpers";

// Requiere los datos de demostración (npm run db:seed) y BILLING_PROVIDER=simulado en el servidor
// (playwright.config.ts lo pone al levantarlo). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("el dueño paga su plan en línea, la tarjeta queda guardada y puede cancelar la renovación", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/configuracion");
  await page.getByRole("link", { name: "Mi plan" }).click();
  await expect(page.getByRole("heading", { name: "Mi plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Tu plan/ })).toContainText("Al día");

  await page.getByLabel("Ciclo de cobro").selectOption("MONTHLY");
  await page.getByRole("button", { name: /^Pagar .+ con tarjeta$/ }).click();
  await expect(page.getByRole("heading", { name: "Pago de prueba" })).toBeVisible();
  await page.getByRole("button", { name: "Pagar con tarjeta de prueba •••• 4242" }).click();

  await expect(page).toHaveURL(/\/configuracion\/plan\?pago=ok/);
  await expect(page.getByText("¡Gracias! Recibimos tu pago.", { exact: false })).toBeVisible();
  await expect(page.getByText("Tarjeta de prueba •••• 4242")).toBeVisible();
  const renew = page.getByLabel("Renovar automáticamente al vencer");
  await expect(renew).toBeChecked();
  await expect(
    page.getByRole("region", { name: "Pagos" }).getByRole("cell", { name: "Tarjeta" }).first()
  ).toBeVisible();

  await renew.uncheck();
  await expect(page.getByText("Renovación automática cancelada")).toBeVisible();
  await expect(renew).not.toBeChecked();
  await renew.check();
  await expect(page.getByText("Renovación automática activada")).toBeVisible();
});

test("el super admin ajusta las reglas del cobro automático", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/planes");
  const grace = page.getByLabel("Días de gracia");
  await expect(grace).toHaveValue("7");
  await grace.fill("10");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/admin/billing-settings") && r.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "Guardar reglas" }).click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Días de gracia")).toHaveValue("10");
  // Deja la regla como estaba.
  await page.getByLabel("Días de gracia").fill("7");
  await page.getByRole("button", { name: "Guardar reglas" }).click();
  await expect(page.getByText("Reglas de cobro guardadas")).toBeVisible();
  await expectAccessible(page);
});

for (const scheme of ["light", "dark"] as const) {
  test(`mi plan y el pago de prueba accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.fonda);
    await page.goto("/configuracion/plan");
    await expect(page.getByText("Tarjeta de prueba •••• 4242")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: /^Pagar .+ con tarjeta$/ }).click();
    await expect(page.getByRole("heading", { name: "Pago de prueba" })).toBeVisible();
    await expectAccessible(page);
  });
}
