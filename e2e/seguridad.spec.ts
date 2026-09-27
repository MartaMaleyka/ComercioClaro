import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectAccessible, loginAdmin } from "./helpers";
import { totpCode } from "../src/lib/totp";

// Seguridad de las cuentas. Cada prueba usa cuentas nuevas (registradas aquí) para no tocar las de demostración.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "Se cubre en escritorio");
});

const PASSWORD = "Clave-Segura-2026";
const unique = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const randomIp = () =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** Registra una cuenta nueva en su propio navegador (queda con la sesión abierta). */
async function newAccount(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `seguridad-${unique()}@prueba.test`;
  const businessName = `Seguridad ${unique()}`;
  const res = await page.request.post("/api/auth/register", {
    headers: { "x-forwarded-for": randomIp() },
    data: {
      name: "Dueña segura",
      businessName,
      email,
      password: PASSWORD,
      country: "PA",
      businessType: "OTRO",
      acceptTerms: true,
      elapsedMs: 8000,
    },
  });
  expect(res.ok()).toBe(true);
  return { page, email, businessName, close: () => context.close() };
}

async function enableMfa(page: Page) {
  await page.goto("/seguridad");
  await page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();
  const key = (await page.locator("p.font-mono").textContent())!.replace(/\s/g, "");
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(key));
  await page.getByRole("button", { name: "Activar", exact: true }).click();
  const codes = page.getByRole("list", { name: "Códigos de recuperación" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  const recovery = await codes.allTextContents();
  await page.getByRole("button", { name: "Ya los guardé" }).click();
  await expect(page.getByText("Activa", { exact: true })).toBeVisible();
  return { key, recovery };
}

test("activar los dos pasos y entrar con un código de recuperación", async ({ browser }) => {
  const account = await newAccount(browser);
  const { page } = account;
  try {
    const { recovery } = await enableMfa(page);
    await page.request.post("/api/auth/logout");

    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(account.email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    const code = page.getByLabel("Código de verificación");
    await expect(code).toBeVisible();
    await expectAccessible(page);

    // Un código equivocado no entra.
    await code.fill("000000");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByText("El código no es correcto")).toBeVisible();

    await code.fill(recovery[0]);
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/seguridad");
    await expect(page.getByText(/Te quedan 9 códigos de recuperación/)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Contraseña correcta, faltó el código" }).first()).toBeVisible();
  } finally {
    await account.close();
  }
});

test("cerrar las sesiones de los demás dispositivos", async ({ browser }) => {
  const account = await newAccount(browser);
  const other = await browser.newContext();
  try {
    const login = await other.request.post("/api/auth/login", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604.1" },
      data: { email: account.email, password: PASSWORD },
    });
    expect(login.ok()).toBe(true);
    expect((await other.request.get("/api/auth/me")).ok()).toBe(true);

    await account.page.goto("/seguridad");
    await expect(account.page.getByText("Este dispositivo")).toBeVisible();
    await expect(account.page.getByText("Safari en iPhone o iPad")).toBeVisible();
    await account.page.getByRole("button", { name: "Cerrar las demás" }).click();
    await account.page.getByRole("dialog").getByRole("button", { name: "Cerrar las demás" }).click();
    await expect(account.page.getByText("1 sesión(es) cerrada(s)")).toBeVisible();

    expect((await other.request.get("/api/auth/me")).status()).toBe(401);
    expect((await account.page.request.get("/api/auth/me")).ok()).toBe(true);
  } finally {
    await other.close();
    await account.close();
  }
});

test("un negocio que exige los dos pasos manda a activarlos", async ({ browser, page }) => {
  const account = await newAccount(browser);
  try {
    await loginAdmin(page);
    await page.goto(`/admin/negocios?search=${encodeURIComponent(account.businessName)}`);
    await page.getByRole("link", { name: account.businessName }).click();
    const toggle = page.getByRole("switch", { name: "Exigir verificación en dos pasos" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await account.page.goto("/dashboard");
    await expect(account.page).toHaveURL(/\/seguridad\?motivo=negocio/);
    await expect(account.page.getByText("Uno de tus negocios exige la verificación en dos pasos")).toBeVisible();
    expect((await account.page.request.get("/api/products")).status()).toBe(403);

    await enableMfa(account.page);
    await account.page.goto("/dashboard");
    await expect(account.page).toHaveURL(/\/dashboard/);
  } finally {
    await account.close();
  }
});

test("el super admin ve la actividad de un usuario y filtra los que no tienen dos pasos", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/usuarios");
  await page.getByRole("radio", { name: "Sin dos pasos" }).click();
  // El administrador de demostración tiene los dos pasos: no aparece en la lista (su correo sí está en el encabezado).
  await expect(page.getByRole("main").getByText(/admin@comercioclaro\.com/)).toHaveCount(0);
  await page.getByRole("radio", { name: "Todos" }).click();
  const card = page
    .locator("div", { hasText: "demo@comercioclaro.com" })
    .filter({ has: page.getByRole("button", { name: "Actividad" }) })
    .last();
  await card.getByRole("button", { name: "Actividad" }).click();
  const dialog = page.getByRole("dialog", { name: /^Actividad de/ });
  await expect(dialog.getByRole("heading", { name: "Inicios de sesión" })).toBeVisible();
  await expectAccessible(page);
});

for (const scheme of ["light", "dark"] as const) {
  test(`seguridad de la cuenta accesible (${scheme === "light" ? "claro" : "oscuro"})`, async ({ browser }) => {
    const account = await newAccount(browser);
    try {
      await account.page.emulateMedia({ colorScheme: scheme });
      await expectAccessible(account.page, "/seguridad");
      await account.page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();
      await expect(account.page.getByRole("img", { name: "Código QR para tu app de autenticación" })).toBeVisible();
      await expectAccessible(account.page);
    } finally {
      await account.close();
    }
  });
}
