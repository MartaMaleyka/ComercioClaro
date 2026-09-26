/**
 * Nombra administrador de la plataforma a un usuario existente (o lo crea con contraseña temporal).
 * Uso: npm run admin:grant -- correo@dominio.com ["Nombre"]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword, normalizeEmail } from "../src/lib/auth";
import { temporaryPassword } from "../src/server/account";

async function main() {
  const [rawEmail, name = "Administrador"] = process.argv.slice(2);
  if (!rawEmail || !rawEmail.includes("@")) {
    console.error("Uso: npm run admin:grant -- correo@dominio.com [\"Nombre\"]");
    process.exitCode = 1;
    return;
  }
  const email = normalizeEmail(rawEmail);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true, disabledAt: null } });
    console.log(`✅ ${email} ahora es administrador de la plataforma (entra en /admin).`);
    return;
  }
  const password = temporaryPassword();
  await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password), mustChangePassword: true, isSuperAdmin: true },
  });
  console.log(`✅ Administrador creado: ${email}`);
  console.log(`   Contraseña temporal (cámbiala al entrar): ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
