import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Requiere los datos de demostración (npm run db:seed).

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|ventas)/);
}

async function expectAccessible(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `${url} tiene problemas de accesibilidad`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accesibilidad (${scheme === "light" ? "claro" : "oscuro"})`, () => {
    test.use({ colorScheme: scheme });

    test("páginas públicas", async ({ page }) => {
      for (const url of ["/", "/login", "/registro", "/recuperar-contrasena", "/c/minisuper-el-dorado"]) {
        await expectAccessible(page, url);
      }
    });

    test("pantallas del dueño", async ({ page }) => {
      await login(page, "demo.pa@comercioclaro.com");
      for (const url of [
        "/dashboard",
        "/ventas",
        "/ventas/historial",
        "/caja",
        "/clientes",
        "/inventario",
        "/compras",
        "/proveedores",
        "/gastos",
        "/promociones",
        "/reportes",
        "/facturas",
        "/configuracion",
      ]) {
        await expectAccessible(page, url);
      }
    });
  });
}

test("los diálogos atrapan el foco, cierran con Escape y lo devuelven", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  await login(page, "demo.pa@comercioclaro.com");
  await page.goto("/clientes");
  const opener = page.getByRole("button", { name: "Cliente", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Nuevo cliente" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nombre")).toBeFocused();

  // Tab desde el último control vuelve al primero sin salir del diálogo.
  for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("las pestañas se recorren con las flechas", async ({ page, isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
  await login(page, "demo.pa@comercioclaro.com");
  await page.goto("/inventario");
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
});

test("la página toma el idioma del usuario", async ({ page }) => {
  await login(page, "cajero.pa@comercioclaro.com");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
});
