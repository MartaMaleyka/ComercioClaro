import type { Page } from "@playwright/test";

// Cuentas de demostración (npm run db:seed). El dueño y el cajero tienen acceso a todos los negocios de ejemplo.
export const OWNER = "demo@comercioclaro.com";
export const CASHIER = "cajero@comercioclaro.com";
export const ADMIN = "admin@comercioclaro.com";

export const BUSINESS = {
  mexico: "Miscelánea La Esperanza",
  panama: "Minisúper El Dorado",
  fonda: "Fonda La Chiricana",
  interior: "Abarrotería Los Santos",
} as const;

/** Inicia sesión y, si se indica, cambia al negocio de ejemplo. */
export async function login(page: Page, email: string, business?: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/(dashboard|ventas)/);
  if (business) await switchBusiness(page, business);
}

export async function switchBusiness(page: Page, name: string) {
  const me = await (await page.request.get("/api/auth/me")).json();
  const target = me.businesses.find((b: { name: string }) => b.name === name);
  if (!target) throw new Error(`El usuario no tiene acceso a ${name}`);
  if (me.business.id === target.id) return;
  const res = await page.request.post("/api/auth/switch-business", { data: { businessId: target.id } });
  if (!res.ok()) throw new Error(`No se pudo cambiar a ${name}`);
  await page.goto(target.role === "OWNER" ? "/dashboard" : "/ventas");
}

/** Cambia el idioma de la interfaz del usuario con sesión iniciada. */
export async function setLanguage(page: Page, language: "es" | "zh" | "en") {
  await page.request.put("/api/auth/me", { data: { language } });
}

/** El super admin entra directo al panel de administración. */
export async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(ADMIN);
  await page.getByLabel("Contraseña").fill("demo1234");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL(/\/admin/);
}

/** Id de un negocio de demostración visto desde el panel de administración. */
export async function adminBusinessId(page: Page, name: string) {
  const list = await (await page.request.get(`/api/admin/businesses?search=${encodeURIComponent(name)}`)).json();
  const found = list.find((b: { name: string }) => b.name === name);
  if (!found) throw new Error(`No existe ${name}`);
  return found.id as string;
}
