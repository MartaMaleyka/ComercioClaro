import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("campaña con cupón: destinatarios y envío asistido", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/campanas");
  await expect(page.getByText("Cumpleaños del mes").first()).toBeVisible();
  const name = `Vuelve E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nueva campaña" }).click();
  const form = page.getByRole("dialog", { name: "Nueva campaña" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("A quién").selectOption("ALL");
  await expect(form.getByText(/\d+ clientes recibirán el mensaje/)).toBeVisible();
  await form.getByLabel("Cupón (opcional)").selectOption({ label: "VUELVE2" });
  await form.getByLabel("Mensaje").fill("Hola {nombre}, te extrañamos. Usa {cupón} y ahorra.");
  await form.getByRole("button", { name: "Crear campaña" }).click();

  const detail = page.getByRole("dialog", { name });
  await expect(detail.getByText(/te extrañamos\. Usa VUELVE2 y ahorra\./).first()).toBeVisible();
  const whatsapp = detail.getByRole("link", { name: /Abrir WhatsApp para/ }).first();
  await expect(whatsapp).toHaveAttribute("href", /wa\.me\/507/);
  await detail
    .getByRole("button", { name: /Marcar enviado a/ })
    .first()
    .click();
  await expect(detail.getByText("Enviado").first()).toBeVisible();
});

test("el cupón se aplica en el punto de venta", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/ventas");
  const product = page.getByRole("button", { name: /^Coca-Cola 2 L/ });
  await product.click();
  await product.click();
  await product.click();
  await page.getByLabel("Cupón", { exact: true }).fill("cumple10");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/Cupón CUMPLE10: −B\/\.\s0\.63/)).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar B\/\.\s5\.67/ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`campañas accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.panama);
    await expectAccessible(page, "/campanas");
    await page.getByRole("button", { name: "Abrir" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Nueva campaña" }).click();
    await expectAccessible(page);
    await expectAccessible(page, "/campanas?tab=cupones");
    await page.getByRole("button", { name: "Cupón", exact: true }).click();
    await expectAccessible(page);
    await page.goto("/clientes");
    await page.getByRole("button", { name: "Cliente", exact: true }).click();
    await expect(page.getByRole("group", { name: "Promociones por WhatsApp" })).toBeVisible();
    await expectAccessible(page);
  });
}
