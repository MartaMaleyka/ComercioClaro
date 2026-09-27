import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio: son flujos largos.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("factura por pagar: abono por banco y estado de cuenta", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  const number = `E2E-${Date.now()}`;
  const suppliers = await (await page.request.get("/api/suppliers")).json();
  const supplier = suppliers.find((s: { name: string }) => s.name.startsWith("Distribuidora Cervecería"));
  const res = await page.request.post("/api/payables", {
    data: { supplierId: supplier.id, number, total: 50, tax: 3.27 },
  });
  expect(res.ok()).toBe(true);

  await page.goto("/compras?tab=por-pagar");
  await expect(page.getByText("Antigüedad de saldos")).toBeVisible();
  await expect(page.getByText(/Vencida hace \d+ días/).first()).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: `Factura ${number}` });
  await card.getByRole("button", { name: "Abonar" }).click();
  const dialog = page.getByRole("dialog", { name: /Abonar a Distribuidora/ });
  await dialog.getByLabel("Monto").fill("20");
  await dialog.getByLabel("Referencia").fill(`ACH-${number}`);
  await dialog.getByRole("button", { name: "Registrar abono" }).click();
  await expect(page.getByText("Abono registrado")).toBeVisible();
  await expect(card.getByText(/B\/\.\s30\.00/)).toBeVisible();

  await card.getByRole("button", { name: "Estado de cuenta" }).click();
  const statement = page.getByRole("dialog", { name: /Estado de cuenta: Distribuidora/ });
  await expect(statement.getByRole("cell", { name: `Factura ${number}`, exact: true })).toBeVisible();
  await expect(statement.getByRole("cell", { name: `Abono a factura ${number} (ref. ACH-${number})` })).toBeVisible();
});

test("compra a crédito queda por pagar y aparece en el tablero", async ({ page }) => {
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/compras");
  await page.getByRole("button", { name: "Nueva compra" }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva compra" });
  await dialog.getByLabel("Proveedor", { exact: true }).selectOption({ label: "Abarrotes Mayoristas del Istmo" });
  await dialog.getByPlaceholder("Agregar producto (nombre o código)").fill("Coca-Cola 2 L");
  await dialog.getByRole("button", { name: /^Coca-Cola 2 L/ }).click();
  await dialog.getByLabel("Pago", { exact: true }).selectOption({ label: "A crédito (queda por pagar)" });
  await dialog.getByLabel("Número de factura").fill("AMI-E2E");
  await dialog.getByRole("button", { name: "Registrar compra" }).click();
  await expect(page.getByText(/A crédito · saldo/).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Por pagar a proveedores")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`cuentas por pagar accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.panama);
    await expectAccessible(page, "/compras?tab=por-pagar");
    await page.getByRole("button", { name: "Abonar" }).first().click();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Estado de cuenta" }).first().click();
    await expect(page.getByRole("table")).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Registrar factura" }).click();
    await expectAccessible(page);
  });
}
