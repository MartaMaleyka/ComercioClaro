import { execSync } from "child_process";

/** Aplica las migraciones a la base de pruebas (TEST_DATABASE_URL) antes de correr. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL no definida: se omiten las pruebas de integración.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
