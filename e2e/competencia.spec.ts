import { expect, test, type Page } from "@playwright/test";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio: son flujos largos.

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|ventas)/);
}

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("reporte de ITBMS y desempeño del equipo", async ({ page }) => {
  await login(page, "demo.pa@comercioclaro.com");
  await page.goto("/reportes");
  await page.getByRole("tab", { name: "Impuestos" }).click();
  await expect(page.getByText("ITBMS a declarar")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "7%" })).toBeVisible();
  await page.getByRole("tab", { name: "Equipo" }).click();
  await expect(page.getByRole("rowheader", { name: /Wei Chen/ })).toBeVisible();
});

test("la pantalla del cliente muestra el carrito del punto de venta", async ({ page, context }) => {
  await login(page, "demo.pa@comercioclaro.com");
  const display = await context.newPage();
  await display.goto("/pantalla-cliente");
  await expect(display.getByText("¡Bienvenido!")).toBeVisible();
  await page.goto("/ventas");
  await page.getByRole("button", { name: /^Coca-Cola 2 L/ }).click();
  await expect(display.getByText("Coca-Cola 2 L")).toBeVisible();
  await expect(display.getByText(/B\/\.\s2\.10/).first()).toBeVisible();
});

test("pedido del catálogo en línea se cobra desde la bandeja", async ({ page, context }) => {
  const catalog = await context.newPage();
  await catalog.goto("/c/minisuper-el-dorado");
  await catalog.getByRole("button", { name: "Agregar Coca-Cola 2 L" }).click();
  await catalog.getByLabel("Tu nombre").fill("Cliente E2E");
  const popup = context.waitForEvent("page");
  await catalog.getByRole("button", { name: /Enviar pedido por WhatsApp/ }).click();
  await (await popup).close();
  await expect(catalog.getByText(/Recibimos tu pedido #\d+/)).toBeVisible();

  await login(page, "demo.pa@comercioclaro.com");
  await page.goto("/pedidos");
  const card = page.getByRole("listitem").filter({ hasText: "Cliente E2E" }).first();
  await card.getByRole("link", { name: "Cobrar en el punto de venta" }).click();
  await expect(page.getByText(/Cobrando el pedido en línea #\d+ de Cliente E2E/)).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar B\/\./ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();
  await page.goto("/pedidos");
  await page.getByRole("tab", { name: "Entregados" }).click();
  await expect(page.getByText(/Cliente E2E/).first()).toBeVisible();
});

test("vale: se vende y se cobra con él en el punto de venta", async ({ page }) => {
  await login(page, "demo.pa@comercioclaro.com");
  const res = await page.request.post("/api/gift-cards", {
    data: { amount: 20, paymentMethod: "CASH", customerName: "Regalo E2E" },
  });
  expect(res.ok()).toBe(true);
  const { code } = await res.json();
  await page.goto("/vales");
  await expect(page.getByText(`•••• ${code.slice(-4)}`).first()).toBeVisible();

  await page.goto("/ventas");
  await page.getByRole("button", { name: /^Coca-Cola 2 L/ }).click();
  await page.getByRole("radio", { name: "Vale" }).click();
  await page.getByLabel("Código del vale").fill(code);
  await page.getByRole("button", { name: "Ver saldo" }).click();
  await expect(page.getByText(/Saldo del vale: B\/\.\s20\.00/)).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar B\/\./ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();
  const after = await (await page.request.get(`/api/gift-cards/lookup?code=${code}`)).json();
  expect(Number(after.balance)).toBe(17.9);
});

test("fonda: variante, extras, cuenta abierta y pantalla de cocina", async ({ page, context }) => {
  const table = `Mesa ${Date.now().toString().slice(-6)}`;
  await login(page, "demo.fonda@comercioclaro.com");
  await page.goto("/ventas");
  await page.getByRole("button", { name: /^Chicha de maracuyá/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Grande/ }).click();
  await page.getByRole("button", { name: /^Sancocho/ }).click();
  const picker = page.getByRole("dialog", { name: "Sancocho" });
  await picker.getByLabel("Arroz").check();
  await picker.getByRole("button", { name: /Agregar · B\/\.\s5\.50/ }).click();
  await expect(page.getByText("+Arroz").first()).toBeVisible();

  await page.getByRole("button", { name: "Guardar como cuenta abierta" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Guardar cuenta" });
  await dialog.getByLabel("Nombre de la cuenta (p. ej. Mesa 3)").fill(table);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Cuenta guardada")).toBeVisible();

  const kitchen = await context.newPage();
  await kitchen.goto("/cocina");
  const ticket = kitchen.getByRole("region", { name: table });
  await expect(ticket.getByText(/1 × Sancocho/)).toBeVisible();
  await expect(ticket.getByText(/Chicha/)).toHaveCount(0);
  await ticket.getByRole("button", { name: "Preparar" }).click();
  await expect(ticket.getByText("Preparando")).toBeVisible();

  await page.getByRole("button", { name: "Cuentas abiertas" }).click();
  const orders = page.getByRole("dialog", { name: "Cuentas abiertas" });
  await orders.getByRole("listitem").filter({ hasText: table }).getByRole("button", { name: "Abrir" }).click();
  await expect(page.getByText(`Cuenta ${table}`, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Cobrar B\/\.\s7\.25/ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();
});
