import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./helpers";

// Registro público y primeros pasos. Requiere los planes de demostración (npm run db:seed).

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

const uniqueEmail = () => `registro-${Date.now()}-${Math.floor(Math.random() * 1000)}@prueba.test`;

async function fillForm(page: Page, email: string) {
  await page.getByLabel("Tu nombre").fill("Rosa Pérez");
  await page.getByLabel("Nombre de tu negocio").fill("Minisúper Rosa");
  await page.getByLabel("Tipo de negocio").selectOption({ label: "Minisúper o abarrotería" });
  await expect(page.getByText(/Te sugerimos: Balanza, compras a crédito/)).toBeVisible();
  await page.getByLabel("Teléfono o WhatsApp").fill("6123-4567");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel(/^Contraseña/).fill("Clave-Segura-2026");
  await expect(page.getByText("Fuerte")).toBeVisible();
}

test("una persona se registra con el plan elegido y ve su guía de primeros pasos", async ({ page }) => {
  await page.goto("/registro?plan=pro");
  await expect(page.getByText(/Plan\s+Pro/)).toBeVisible();
  await fillForm(page, uniqueEmail());

  // Sin aceptar los términos no se crea la cuenta.
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(/debes aceptar los términos/)).toBeVisible();

  await page.getByLabel(/Acepto los términos de uso/).check();
  // Un formulario enviado al instante se toma como bot: se espera como lo haría una persona.
  await page.waitForTimeout(2600);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForURL(/\/dashboard/);

  await expect(page.getByText(/Confirma tu correo registro-/)).toBeVisible();
  const guide = page.getByRole("heading", { name: "Primeros pasos" });
  await expect(guide).toBeVisible();
  await expect(page.getByText("Agrega tus productos")).toBeVisible();
  await expect(page.getByText("Registra a tus proveedores")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Reenviar enlace" }).first().click();
  await expect(page.getByText("Te enviamos un nuevo enlace. Revisa tu correo.")).toBeVisible();

  await page.getByRole("button", { name: "Ocultar la guía de primeros pasos" }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toHaveCount(0);
});

test("el registro rechaza bots y exige aceptar los términos", async ({ request }) => {
  const body = {
    name: "Bot",
    businessName: "Bot SA",
    email: uniqueEmail(),
    password: "Clave-Segura-2026",
    country: "PA",
    businessType: "OTRO",
    acceptTerms: true,
    elapsedMs: 10_000,
  };
  const honeypot = await request.post("/api/auth/register", { data: { ...body, website: "https://spam.test" } });
  expect(honeypot.status()).toBe(400);
  const tooFast = await request.post("/api/auth/register", { data: { ...body, elapsedMs: 300 } });
  expect(tooFast.status()).toBe(400);
  const noTerms = await request.post("/api/auth/register", { data: { ...body, acceptTerms: false } });
  expect(noTerms.status()).toBe(400);
  expect((await noTerms.json()).error).toMatch(/aceptar los términos/);
});

test("un enlace de confirmación inválido lo explica", async ({ page }) => {
  await page.goto(`/verificar-correo?token=${"a".repeat(64)}`);
  await page.getByRole("button", { name: "Confirmar mi correo" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no es válido o ya venció" })).toBeVisible();
  await page.goto("/verificar-correo");
  await expect(page.getByRole("alert").filter({ hasText: "Falta el enlace de confirmación" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`registro, términos y privacidad accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await expectAccessible(page, "/registro?plan=pro");
    await expectAccessible(page, "/terminos");
    await expectAccessible(page, "/privacidad");
    await expectAccessible(page, `/verificar-correo?token=${"b".repeat(64)}`);
  });
}
