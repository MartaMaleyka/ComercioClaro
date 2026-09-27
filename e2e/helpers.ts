import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

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

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Revisa la página con axe (WCAG 2.2 AA). Sin url, revisa la página tal como está. */
export async function expectAccessible(page: Page, url?: string) {
  if (url) await page.goto(url);
  // Algunas pantallas consultan al servidor cada pocos segundos; no esperar indefinidamente a la red inactiva.
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  // Un diálogo que aún está apareciendo (opacidad en transición) da falsos problemas de contraste.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))).catch(() => undefined);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `${url ?? page.url()} tiene problemas de accesibilidad`).toEqual([]);
}
