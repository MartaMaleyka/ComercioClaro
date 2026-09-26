import { expect, test } from "@playwright/test";
import { BUSINESS, CASHIER, OWNER, login } from "./helpers";

// Requiere la base con datos de demostración (npm run db:seed).

test("el dueño vende en efectivo y ve el ticket en el historial", async ({ page, isMobile }) => {
  await login(page, OWNER, BUSINESS.mexico);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/ventas");
  // Espera a que cargue el catálogo antes de "escanear".
  await expect(page.getByRole("button", { name: /Coca-Cola 600ml/ })).toBeVisible();
  await page.getByPlaceholder("Buscar o escanear código (F2)").fill("7501055300075");
  await page.keyboard.press("Enter");
  if (isMobile) await page.getByRole("button", { name: /Ver carrito/ }).click();

  const panel = isMobile ? page.getByRole("dialog") : page.locator("div", { has: page.getByRole("heading", { name: "Venta actual" }) }).last();
  await panel.getByLabel("Paga con").fill("50");
  await expect(panel.getByText("Cambio")).toBeVisible();
  await panel.getByRole("button", { name: /^Cobrar/ }).click();

  const done = page.getByRole("dialog", { name: "¡Venta registrada!" });
  await expect(done).toBeVisible();
  await expect(done.getByText(/Cambio: \$32\.00/)).toBeVisible();
  const folio = await done.getByText(/Ticket #\d+/).textContent();
  await done.getByRole("button", { name: "Nueva venta" }).click();

  await page.goto("/ventas/historial");
  await expect(page.getByText(new RegExp(`${folio!.replace("Ticket ", "")} ·`))).toBeVisible();
});

test("el cajero no puede ver reportes ni costos", async ({ page }) => {
  await login(page, CASHIER, BUSINESS.mexico);
  await expect(page).toHaveURL(/\/ventas/);
  await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);

  const res = await page.request.get("/api/reports");
  expect(res.status()).toBe(403);
  const products = await (await page.request.get("/api/products?all=true")).json();
  expect(products.items[0]).not.toHaveProperty("cost");
});

test("las páginas privadas redirigen a login sin sesión", async ({ page }) => {
  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/login\?next=%2Freportes/);
});

test("vende sin conexión y sincroniza al volver la red", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "El flujo sin conexión se cubre en escritorio");
  await login(page, OWNER, BUSINESS.mexico);
  await page.goto("/ventas");
  await expect(page.getByRole("button", { name: /Sabritas Original/ })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: /Sabritas Original/ }).click();
  await page.getByRole("button", { name: /^Cobrar/ }).click();
  const done = page.getByRole("dialog", { name: "Venta guardada sin conexión" });
  await expect(done).toBeVisible();
  await done.getByRole("button", { name: "Nueva venta" }).click();
  await expect(page.getByText(/1 venta\(s\) pendiente\(s\)/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/venta\(s\) sin conexión sincronizada\(s\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/pendiente\(s\) de enviar/)).toHaveCount(0);
});
