import { expect, test } from "@playwright/test";
import { OWNER } from "./helpers";

// El ojito muestra y oculta la contraseña sin cambiar cómo se nombra el campo.

test("el ojito muestra y oculta la contraseña en el inicio de sesión", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Contraseña");
  await password.fill("demo1234");
  await expect(password).toHaveAttribute("type", "password");

  const eye = page.getByRole("button", { name: "Mostrar contraseña" });
  await eye.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("demo1234");
  await expect(page.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(password).toHaveAttribute("type", "password");

  // Se puede entrar igual con la contraseña visible.
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await page.getByLabel("Correo electrónico").fill(OWNER);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|ventas)/);
});
