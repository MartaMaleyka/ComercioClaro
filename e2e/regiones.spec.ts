import { expect, test, type Page } from "@playwright/test";
import { BUSINESS, OWNER, login } from "./helpers";

// Capital e interior de Panamá. Requiere los datos de demostración (npm run db:seed).

const salePanel = (page: Page) =>
  page.locator("div", { has: page.getByRole("heading", { name: "Venta actual" }) }).last();

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("fonda: descuento de jubilado en el punto de venta y en el reporte mensual", async ({ page }) => {
  await login(page, OWNER, BUSINESS.fonda);
  await page.goto("/ventas");
  await page.getByRole("button", { name: /^Carimañola/ }).click();
  const panel = salePanel(page);
  await panel.getByLabel("Jubilado o pensionado (25%)").check();
  await panel.getByLabel("Cédula o carné del jubilado").fill("7-88-999");
  await expect(panel.getByText("Incluye descuento de jubilado")).toBeVisible();
  // 0.75 − 25% (0.19) = 0.56
  await panel.getByRole("button", { name: /^Cobrar B\/\.\s?0\.56/ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();

  await page.goto("/reportes");
  await page.getByRole("tab", { name: "Jubilados" }).click();
  await expect(page.getByRole("cell", { name: "7-88-999" }).first()).toBeVisible();
});

test("interior: venta por libra y corte contando billetes y monedas", async ({ page }) => {
  await login(page, OWNER, BUSINESS.interior);
  await page.goto("/ventas");
  await expect(page.getByRole("button", { name: /^Queso blanco \(libra\)/ })).toContainText("/lb");

  await page.goto("/caja");
  await page.getByRole("button", { name: "Hacer corte" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("$20").fill("1");
  await dialog.getByLabel("25¢").fill("3");
  await expect(dialog.getByText(/Total contado: B\/\.\s?20\.75/)).toBeVisible();
  await expect(dialog.getByLabel("Efectivo contado")).toHaveValue("20.75");
});

test("capital: el catálogo cobra la entrega según la zona", async ({ page }) => {
  await page.goto("/c/minisuper-el-dorado");
  await page.getByRole("button", { name: "Agregar Coca-Cola 2 L" }).click();
  await page.getByLabel("A domicilio").check();
  await page.getByLabel("Zona de entrega").selectOption("San Francisco");
  await expect(page.getByRole("button", { name: /Enviar pedido por WhatsApp · B\/\.\s?5\.10/ })).toBeVisible();
});
