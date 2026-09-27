import { expect, test } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed). Solo en escritorio.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

test("empleado nuevo, planilla con horas extra, pago y comprobantes", async ({ page, context }) => {
  await login(page, OWNER, BUSINESS.fonda);
  const name = `Empleado E2E ${Date.now()}`;
  await page.goto("/planilla");
  await expect(page.getByText("Yaritza Pérez")).toBeVisible();
  await page.getByRole("button", { name: "Empleado", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Nuevo empleado" });
  await form.getByLabel("Nombre").fill(name);
  await form.getByLabel("Salario mensual").fill("832");
  await form.getByLabel("Se paga").selectOption("MENSUAL");
  await form.getByLabel("Fecha de ingreso").fill("1990-01-01");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(name)).toBeVisible();

  // Un mes pasado distinto en cada corrida para no repetir la planilla.
  const n = Date.now() % 1200;
  const date = `${2100 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-10`;
  await page.getByRole("tab", { name: "Planillas" }).click();
  await page.getByLabel("Tipo de planilla").selectOption("MENSUAL");
  await page.getByLabel("Del periodo que incluye").fill(date);
  await page.getByRole("button", { name: "Crear planilla" }).click();
  const detail = page.getByRole("dialog", { name: /^Planilla / });
  await expect(detail.getByRole("rowheader", { name })).toBeVisible();
  await detail.getByLabel(`Horas extra de ${name}`).fill("10");
  await detail.getByLabel(`Horas extra de ${name}`).blur();
  await expect(
    detail
      .getByRole("row")
      .filter({ hasText: name })
      .getByText(/B\/\.\s882\.00/)
  ).toHaveCount(0);

  const payslips = context.waitForEvent("page");
  await detail.getByRole("link", { name: "Comprobantes de pago" }).click();
  const slip = await payslips;
  await expect(slip.getByText(name)).toBeVisible();
  await expect(slip.getByText(/Horas extra \(10 h\)/).first()).toBeVisible();
  await slip.close();

  await detail.getByRole("button", { name: "Pagar planilla" }).click();
  await expect(page.getByText("Planilla pagada")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Registrar pago a la CSS y del ISR" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`planilla accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OWNER, BUSINESS.fonda);
    await expectAccessible(page, "/planilla");
    await expectAccessible(page, "/planilla?tab=planillas");
    await page.getByRole("button", { name: "Ver detalle" }).first().click();
    await expect(page.getByRole("table", { name: "Detalle de la planilla" })).toBeVisible();
    await expectAccessible(page);
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Planilla" })).toBeVisible();
    await expectAccessible(page);
  });
}
