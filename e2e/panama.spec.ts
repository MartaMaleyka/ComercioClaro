import { expect, test, type Page } from "@playwright/test";

// Requiere los datos de demostración de Panamá (npm run db:seed).

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|ventas)/);
}

test("minisúper en Panamá cobra con Yappy en balboas", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  await login(page, "demo.pa@comercioclaro.com");
  // El tablero avisa de los límites del facturador gratuito solo si se acercan; los montos van en B/.
  await expect(page.getByText(/B\/\.\s[\d,]+\.\d{2}/).first()).toBeVisible();

  await page.goto("/ventas");
  await page.getByRole("button", { name: /Coca-Cola 2 L/ }).click();
  await page.getByRole("radio", { name: "Yappy" }).click();
  await expect(page.getByText(/Directorio: @minisupereldorado/)).toBeVisible();
  await page.getByLabel("N.º de operación Yappy (opcional)").fill("998877");
  await page.getByRole("button", { name: /^Cobrar B\/\./ }).click();

  const done = page.getByRole("dialog", { name: "¡Venta registrada!" });
  await expect(done.getByText(/B\/\.\s2\.10/)).toBeVisible();
  await done.getByRole("button", { name: "Nueva venta" }).click();

  await page.goto("/ventas/historial");
  await expect(page.getByText(/Yappy \(ref\. 998877\)/).first()).toBeVisible();

  await page.goto("/facturas");
  await expect(page.getByText("Facturas (DGI Panamá)")).toBeVisible();
  await expect(page.getByText(/Ingresos \d{4}/)).toBeVisible();
});

test("el cajero ve el punto de venta en chino", async ({ page }) => {
  await login(page, "cajero.pa@comercioclaro.com");
  await expect(page.getByPlaceholder("搜索或扫描条码 (F2)")).toBeVisible();
  await expect(page.getByRole("link", { name: "钱箱" }).first()).toBeVisible();
});
