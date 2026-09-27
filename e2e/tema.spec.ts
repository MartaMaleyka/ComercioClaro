import { expect, test } from "@playwright/test";
import { expectAccessible, login, OWNER } from "./helpers";

// Modo oscuro: se cambia con un toque, se recuerda y sigue al sistema cuando se elige "Sistema".

test.use({ colorScheme: "light" });

test("el modo oscuro se activa desde la barra lateral, se recuerda y vuelve a seguir al sistema", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "En el celular se cubre con el menú Más");
  await login(page, OWNER);
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Modo oscuro" }).click();
  await expect(html).toHaveClass(/dark/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#0e1512");
  await expectAccessible(page);

  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Modo claro" })).toBeVisible();

  await page.goto("/configuracion");
  await page.getByRole("tab", { name: "Mi cuenta" }).click();
  const theme = page.getByRole("radiogroup", { name: "Tema" });
  await expect(theme.getByRole("radio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");
  await theme.getByRole("radio", { name: "Sistema" }).click();
  // El sistema está en claro en esta prueba.
  await expect(html).not.toHaveClass(/dark/);
});

test("en el celular el tema se elige en el menú Más y en el encabezado", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Se cubre en escritorio con la barra lateral");
  await login(page, OWNER);
  const html = page.locator("html");

  await page.getByRole("button", { name: "Más" }).click();
  const menu = page.getByRole("dialog", { name: "Menú" });
  await menu.getByRole("radiogroup", { name: "Tema" }).getByRole("radio", { name: "Oscuro" }).click();
  await expect(html).toHaveClass(/dark/);
  await expectAccessible(page);
  await menu.getByRole("button", { name: "Cerrar" }).click();

  await page.getByRole("button", { name: "Cambiar a modo claro" }).click();
  await expect(html).not.toHaveClass(/dark/);
});
