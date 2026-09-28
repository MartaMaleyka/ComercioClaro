import { expect, test, type Page } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio: son flujos largos.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

async function productId(page: Page, name: string) {
  const res = await page.request.get(`/api/products?search=${encodeURIComponent(name)}`);
  const { items } = await res.json();
  return items.find((p: { name: string }) => p.name === name).id as string;
}

test("la venta de un plato descuenta sus insumos", async ({ page }) => {
  await login(page, OWNER, BUSINESS.fonda);
  await page.goto("/inventario?tab=insumos");
  const dishes = page.getByRole("region", { name: "Platos con receta" });
  await expect(dishes.getByText("Sancocho")).toBeVisible();
  await expect(dishes.getByText(/Margen \d+/).first()).toBeVisible();

  // El editor muestra el costo por plato.
  await page.goto("/inventario");
  await page.getByPlaceholder("Buscar por nombre, código o SKU").fill("Sancocho");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar producto" });
  await dialog.getByRole("button", { name: /receta e insumos/ }).click();
  await expect(dialog.getByText(/Costo por plato: B\/\./)).toBeVisible();
  await expect(dialog.getByLabel("Porciones que rinde la receta")).toHaveValue("10");
  await page.keyboard.press("Escape");

  const note = `E2E-${Date.now()}`;
  await page.goto("/ventas");
  // Los insumos no aparecen en el punto de venta.
  await expect(page.getByRole("button", { name: /^Pollo \(insumo\)/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Sancocho/ }).click();
  await page.getByRole("dialog", { name: "Sancocho" }).getByRole("button", { name: /Agregar/ }).click();
  await page.getByLabel("Notas").fill(note);
  await page.getByRole("button", { name: /^Cobrar B\/\./ }).click();
  await expect(page.getByRole("dialog", { name: "¡Venta registrada!" })).toBeVisible();

  // La olla rinde 10 platos con 5 lb de pollo: el kárdex del pollo tiene −0.5 lb por esta venta.
  const sales = await (await page.request.get(`/api/sales?search=${note}`)).json();
  const saleId = sales.items[0].id;
  const chicken = await productId(page, "Pollo (insumo)");
  const kardex = await (await page.request.get(`/api/products/${chicken}/movements?limit=50`)).json();
  const move = kardex.items.find((m: { referenceId: string }) => m.referenceId === saleId);
  expect(Number(move.quantity)).toBe(-0.5);
});

test("reporte de merma", async ({ page }) => {
  await login(page, OWNER, BUSINESS.fonda);
  await page.goto("/reportes");
  await page.getByRole("tab", { name: "Merma" }).click();
  await expect(page.getByRole("rowheader", { name: /Culantro/ })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`insumos y merma accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.fonda);
    await expectAccessible(page, "/inventario?tab=insumos");
    await page.goto("/reportes");
    await page.getByRole("tab", { name: "Merma" }).click();
    await expect(page.getByRole("rowheader", { name: /Culantro/ })).toBeVisible();
    await expectAccessible(page);
    await page.goto("/inventario");
    await page.getByRole("button", { name: "Producto", exact: true }).click();
    await page.getByRole("button", { name: /receta e insumos/ }).click();
    await page.getByRole("button", { name: "Agregar insumo" }).click();
    await expectAccessible(page);
  });
}
