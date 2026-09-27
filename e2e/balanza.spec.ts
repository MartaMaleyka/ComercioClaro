import { expect, test, type Page } from "@playwright/test";
import { BUSINESS, OWNER, expectAccessible, login } from "./helpers";

// Requiere los datos de demostración (npm run db:seed): "Jamón de pierna (libra)" con PLU 00406.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "La balanza se conecta en computadoras");
});

/** Balanza falsa por Web Serial que siempre responde 2.5 lb estables. */
async function fakeScale(page: Page) {
  await page.addInitScript(() => {
    const port = {
      open: async () => undefined,
      close: async () => undefined,
      writable: new WritableStream<Uint8Array>(),
      readable: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("ST,GS,+  2.500lb\r\n"));
        },
      }),
    };
    Object.defineProperty(navigator, "serial", {
      value: { requestPort: async () => port, getPorts: async () => [port] },
    });
  });
}

test("una etiqueta de peso agrega el producto con su cantidad y la balanza la actualiza", async ({ page }) => {
  await fakeScale(page);
  await login(page, OWNER, BUSINESS.panama);
  await page.goto("/ventas");
  await expect(page.getByRole("button", { name: /^Jamón de pierna \(libra\)/ })).toBeVisible();
  // 2 0 00406 01250 + verificador: 1.250 lb del PLU 00406.
  await page.getByPlaceholder("Buscar o escanear código (F2)").fill("2000406012506");
  await page.keyboard.press("Enter");
  const quantity = page.getByLabel("Cantidad de Jamón de pierna (libra)");
  await expect(quantity).toHaveValue("1.25");

  await page.getByRole("button", { name: "Pesar Jamón de pierna (libra)" }).click();
  await expect(quantity).toHaveValue("2.5");
});

for (const scheme of ["light", "dark"] as const) {
  test(`configuración de la balanza accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await fakeScale(page);
    await login(page, OWNER, BUSINESS.panama);
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Balanza", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Probar lectura" })).toBeVisible();
    await page.getByRole("button", { name: "Probar lectura" }).click();
    await expect(page.getByText("Peso leído: 2.5 LB")).toBeVisible();
    await expectAccessible(page);
  });
}
