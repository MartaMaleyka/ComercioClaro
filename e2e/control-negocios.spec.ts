import { expect, test, type APIRequestContext } from "@playwright/test";
import { BUSINESS, expectAccessible, loginAdmin } from "./helpers";

// Super admin: registros, bajas y reactivaciones. Requiere los datos de demostración (npm run db:seed).
// Cada prueba crea sus propios negocios y deja la plataforma como estaba.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

/** Alta de un negocio por el super admin (no depende de la aprobación de registros) y sesión del dueño. */
async function createBusiness(admin: APIRequestContext, owner: APIRequestContext, name: string) {
  const email = `control-${unique()}@prueba.test`;
  const res = await admin.post("/api/admin/businesses", {
    data: { businessName: name, ownerName: "Dueña de prueba", email, country: "PA" },
  });
  expect(res.ok()).toBe(true);
  const { tempPassword } = await res.json();
  const login = await owner.post("/api/auth/login", { data: { email, password: tempPassword } });
  expect(login.ok()).toBe(true);
}

test("filtros, exportación a CSV y datos de registro en la lista de negocios", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/negocios");
  await page.getByLabel("Tipo").selectOption({ label: "Fonda, restaurante o cafetería" });
  await expect(page.getByRole("link", { name: BUSINESS.fonda })).toBeVisible();
  await expect(page.getByRole("link", { name: BUSINESS.panama })).toHaveCount(0);
  await expect(page).toHaveURL(/businessType=FONDA/);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^negocios-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await (await file.createReadStream()).toArray();
  const text = Buffer.concat(csv).toString("utf8");
  expect(text).toContain("Negocio,Tipo,País,Dueño,Correo");
  expect(text).toContain(BUSINESS.fonda);
  expect(text).not.toContain(BUSINESS.panama);

  await page.getByRole("button", { name: /^Quitar filtros/ }).click();
  await expect(page.getByRole("link", { name: BUSINESS.panama })).toBeVisible();
});

test("dar de baja un negocio lo bloquea con el motivo y reactivarlo lo devuelve", async ({ page, playwright }) => {
  const name = `Baja ${unique()}`;
  const owner = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  await loginAdmin(page);
  await createBusiness(page.request, owner, name);

  await page.goto(`/admin/negocios?search=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Dar de baja" }).click();
  const dialog = page.getByRole("dialog", { name: `Dar de baja ${name}` });
  await dialog.getByLabel("Motivo").fill("Lo pidió el dueño");
  await dialog.getByRole("button", { name: "Dar de baja" }).click();
  await expect(page.getByText(/Dado de baja el .*Motivo: Lo pidió el dueño/)).toBeVisible();

  const blocked = await owner.get("/api/products");
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error).toMatch(/dado de baja/);

  await page.getByRole("button", { name: "Reactivar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Negocio reactivado")).toBeVisible();
  expect((await owner.get("/api/products")).ok()).toBe(true);
  await owner.dispose();
});

for (const scheme of ["light", "dark"] as const) {
  test(`negocios y resumen del super admin accesibles (${scheme === "light" ? "claro" : "oscuro"})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await loginAdmin(page);
    await expectAccessible(page, "/admin");
    await expect(page.getByRole("heading", { name: "Registros por semana" })).toBeVisible();
    await expectAccessible(page, "/admin/negocios");
    await page.getByRole("link", { name: BUSINESS.interior }).click();
    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
  });
}
