import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login, loginAdmin } from "./helpers";

// Super admin: funciones por plan y por negocio. Requiere los datos de demostración (npm run db:seed).
// Cada prueba deja los planes y los negocios como estaban.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("el super admin apaga Pagos divididos a un negocio y el punto de venta lo refleja", async ({ page, browser }) => {
  await loginAdmin(page);
  await page.getByRole("link", { name: "Funciones" }).click();
  await expect(page.getByRole("heading", { name: "Funciones", exact: true })).toBeVisible();

  // Buscar y filtrar.
  await page.getByLabel("Buscar función").fill("planilla");
  await expect(page.getByRole("rowheader", { name: /^Planilla/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /^Promociones/ })).toHaveCount(0);
  await page.getByLabel("Buscar función").fill("");
  await page.getByRole("radio", { name: "Nuevas" }).click();
  await expect(page.getByRole("rowheader", { name: /^Promociones/ })).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: /^Pagos divididos/ })).toBeVisible();

  await page.getByRole("button", { name: /^Negocios con Pagos divididos/ }).click();
  const dialog = page.getByRole("dialog", { name: "Pagos divididos" });
  const control = dialog.getByRole("radiogroup", { name: `Pagos divididos en ${BUSINESS.mexico}` });
  const saveFeature = () =>
    page.waitForResponse((r) => /\/api\/admin\/businesses\/[^/]+\/features$/.test(r.url()) && r.request().method() === "PUT");
  let saved = saveFeature();
  await control.getByRole("radio", { name: "Desactivada solo para este negocio" }).click();
  expect((await saved).ok()).toBe(true);

  const owner = await (await browser.newContext()).newPage();
  try {
    await login(owner, OWNER, BUSINESS.mexico);
    await owner.goto("/ventas");
    await expect(owner.getByRole("button", { name: /Coca-Cola 600ml/ })).toBeVisible();
    await expect(owner.getByRole("button", { name: "Dividir pago" })).toHaveCount(0);
  } finally {
    saved = saveFeature();
    await control.getByRole("radio", { name: /^Según el plan/ }).click();
    expect((await saved).ok()).toBe(true);
  }
  await owner.reload();
  await expect(owner.getByRole("button", { name: "Dividir pago" })).toBeVisible();
});

test("quitar una función de un plan pide confirmación y se puede volver a encender", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/funciones");
  const toggle = page.getByRole("switch", { name: "Balanza conectada en el plan Básico" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await toggle.click();
  const confirm = page.getByRole("dialog", { name: "¿Quitar Balanza conectada del plan Básico?" });
  await expect(confirm).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes("/features") && r.request().method() === "PUT");
  await confirm.getByRole("button", { name: "Quitar del plan" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Encender no pide confirmación.
  const again = page.waitForResponse((r) => r.url().includes("/features") && r.request().method() === "PUT");
  await toggle.click();
  expect((await again).ok()).toBe(true);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

for (const scheme of ["light", "dark"] as const) {
  test(`funciones del super admin accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await loginAdmin(page);
    await expectAccessible(page, "/admin/funciones");
    await page.getByRole("button", { name: /^Negocios con Recetas e insumos/ }).click();
    await expect(page.getByRole("dialog", { name: "Recetas e insumos" }).getByRole("listitem").first()).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    // Ficha del negocio con las funciones agrupadas.
    await page.goto("/admin/negocios");
    await page.getByRole("link", { name: BUSINESS.fonda }).click();
    await expect(page.getByRole("heading", { name: "Funciones" })).toBeVisible();
    await expectAccessible(page);
  });
}
