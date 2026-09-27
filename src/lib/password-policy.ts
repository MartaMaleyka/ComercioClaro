/**
 * Contraseñas que se adivinan primero en un ataque: las más usadas en español e inglés, series de
 * teclado y el nombre de la plataforma. Se rechazan al crear o cambiar la contraseña.
 */
const COMMON = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "11111111",
  "00000000",
  "12341234",
  "11223344",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwertyui",
  "qwerty123",
  "asdfghjk",
  "abcd1234",
  "abc12345",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "welcome1",
  "contraseña",
  "contrasena",
  "contraseña1",
  "contrasena1",
  "contraseña123",
  "micontraseña",
  "teamo123",
  "tequiero",
  "1q2w3e4r",
  "zaq12wsx",
  "panama123",
  "panama2024",
  "panama2025",
  "panama2026",
  "mexico123",
  "comercio",
  "comercioclaro",
  "comercio123",
  "tienda123",
  "negocio123",
  "admin123",
  "administrador",
  "superman",
  "dragon12",
  "master12",
]);

/** ¿La contraseña es de las más comunes (o una serie como 12345678 / aaaaaaaa)? */
export function isCommonPassword(password: string) {
  const value = password.trim().toLowerCase();
  if (COMMON.has(value)) return true;
  if (/^(.)\1+$/.test(value)) return true;
  // Series de dígitos seguidos: 23456789, 98765432…
  if (/^\d+$/.test(value)) {
    const digits = [...value].map(Number);
    const step = digits[1] - digits[0];
    if (Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) return true;
  }
  return false;
}
