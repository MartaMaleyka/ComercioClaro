import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, adminBusinessId, login, loginAdmin } from "./helpers";

// Super admin. Requiere los datos de demostración (npm run db:seed). Cada prueba deja el negocio como estaba.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("la portada muestra los planes y el registro recibe el plan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Planes y precios" })).toBeVisible();
  await page.getByRole("link", { name: "Elegir Pro" }).click();
  await expect(page).toHaveURL(/\/registro\?plan=pro/);
});

test("el super admin ve el resumen y desactiva una función a un negocio", async ({ page, browser }) => {
  await loginAdmin(page);
  await expect(page.getByRole("heading", { name: "Resumen de la plataforma" })).toBeVisible();
  await expect(page.getByText("Ingreso mensual recurrente")).toBeVisible();

  await page.getByRole("link", { name: "Negocios" }).click();
  await page.getByRole("link", { name: BUSINESS.panama }).click();
  await expect(page.getByRole("heading", { name: BUSINESS.panama })).toBeVisible();
  const giftCards = page.getByLabel("Función Vales (tarjetas de regalo)");
  await giftCards.selectOption("off");
  await page.getByRole("button", { name: "Guardar funciones" }).click();
  await expect(page.getByText("Funciones actualizadas")).toBeVisible();

  const owner = await (await browser.newContext()).newPage();
  try {
    await login(owner, OWNER, BUSINESS.panama);
    await expect(owner.getByRole("link", { name: "Vales" })).toHaveCount(0);
    const res = await owner.request.get("/api/gift-cards");
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/Tu plan no incluye/);
  } finally {
    await page.getByLabel("Función Vales (tarjetas de regalo)").selectOption("plan");
    // El aviso del primer guardado puede seguir visible: se espera la respuesta de este guardado.
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/admin/businesses/") && r.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Guardar funciones" }).click();
    expect((await saved).ok()).toBe(true);
  }
  await owner.goto("/dashboard");
  await expect(owner.getByRole("link", { name: "Vales" }).first()).toBeVisible();
});

test("suspender bloquea el negocio y registrar el pago lo reactiva", async ({ page, browser }) => {
  await loginAdmin(page);
  const id = await adminBusinessId(page, BUSINESS.interior);
  const before = await (await page.request.get(`/api/admin/businesses/${id}`)).json();

  try {
    await page.goto(`/admin/negocios/${id}`);
    await page.getByLabel("Estado").selectOption("SUSPENDED");
    await page.getByLabel("Motivo de la suspensión").fill("Pago pendiente de septiembre");
    await page.getByRole("button", { name: "Guardar suscripción" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
    await expect(page.getByText("Suspendido").first()).toBeVisible();

    const owner = await (await browser.newContext()).newPage();
    await login(owner, OWNER, BUSINESS.interior);
    await expect(owner.getByRole("heading", { name: "Negocio suspendido" })).toBeVisible();
    await expect(owner.getByText(/Pago pendiente de septiembre/)).toBeVisible();
    expect((await owner.request.get("/api/products")).status()).toBe(403);

    await page.getByRole("button", { name: "Registrar pago" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Registrar pago" });
    await dialog.getByLabel("Monto").fill("9.99");
    await dialog.getByLabel("Referencia").fill("E2E");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText("Pago registrado")).toBeVisible();

    await owner.goto("/dashboard");
    await expect(owner.getByRole("heading", { name: "Negocio suspendido" })).toHaveCount(0);
    await expect(owner.getByText(BUSINESS.interior).first()).toBeVisible();
  } finally {
    // Deja la demo del interior como estaba (en prueba).
    await page.request.patch(`/api/admin/businesses/${id}`, {
      data: {
        status: before.status,
        trialEndsAt: before.trialEndsAt,
        paidUntil: before.paidUntil,
        suspendedReason: null,
      },
    });
  }
});

test("entrar como soporte y salir", async ({ page }) => {
  await loginAdmin(page);
  const id = await adminBusinessId(page, BUSINESS.fonda);
  await page.goto(`/admin/negocios/${id}`);
  await page.getByRole("button", { name: "Entrar como soporte" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText(`Modo soporte en ${BUSINESS.fonda}`)).toBeVisible();
  await page.getByRole("button", { name: "Salir del modo soporte" }).click();
  await page.waitForURL(/\/admin$/);
});

test("los usuarios que no son super admin no entran al panel", async ({ page }) => {
  await login(page, OWNER, BUSINESS.mexico);
  expect((await page.request.get("/api/admin/overview")).status()).toBe(403);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard/);
});
