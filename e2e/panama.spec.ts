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

test("las demás pantallas también salen en chino y se puede reportar una traducción", async ({ page }) => {
  await login(page, "cajero.pa@comercioclaro.com");
  await page.goto("/clientes");
  await expect(page.getByText("赊账账户和开票资料")).toBeVisible();

  await page.goto("/configuracion");
  await page.getByRole("button", { name: "报告翻译问题" }).last().click();
  const dialog = page.getByRole("dialog", { name: "报告翻译问题" });
  await dialog.getByLabel("页面上的文字").fill("钱箱");
  await dialog.getByLabel("应该怎么说").fill("收银机");
  await dialog.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("谢谢，我们会检查这条翻译")).toBeVisible();
});

test("la promoción de cerveza se aplica sola en el punto de venta", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  await login(page, "demo.pa@comercioclaro.com");
  await page.goto("/ventas");
  const beer = page.getByRole("button", { name: /^Cerveza Panamá lata/ });
  for (let i = 0; i < 6; i++) await beer.click();
  await expect(page.getByText(/6 Cerveza Panamá por B\/\.5\.00 −B\/\.\s1\.00/)).toBeVisible();
});

test("el catálogo público se abre sin iniciar sesión", async ({ page }) => {
  await page.goto("/c/minisuper-el-dorado");
  await expect(page.getByRole("heading", { name: "Minisúper El Dorado" })).toBeVisible();
  await expect(page.getByText("Coca-Cola 2 L")).toBeVisible();
});
