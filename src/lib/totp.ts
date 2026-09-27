import crypto from "crypto";

/**
 * Verificación en dos pasos con códigos de 6 dígitos que cambian cada 30 s (TOTP, RFC 6238), los
 * de Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc. Sin dependencias.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Clave de la cuenta de demostración del super admin (solo para el seed y las pruebas). */
export const DEMO_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string) {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Clave inválida");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Clave nueva de 160 bits en base32 (la que se guarda cifrada y se muestra para escribirla a mano). */
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** Código de 6 dígitos para un instante (HOTP con el contador de 30 s). */
export function totpCode(secret: string, at = Date.now()) {
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Acepta el código actual y el de ±30 s (relojes desfasados), en tiempo constante. */
export function verifyTotp(secret: string, code: string, at = Date.now(), window = 1) {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  for (let i = -window; i <= window; i++) {
    const expected = totpCode(secret, at + i * STEP_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

/** Dirección que leen las apps de autenticación (se muestra como código QR). */
export function otpauthUrl(secret: string, account: string, issuer = "ComercioClaro") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** Códigos de recuperación de un solo uso (por si se pierde el teléfono): XXXX-XXXX. */
export function generateRecoveryCodes(count = 10) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

// ---------- Cifrado de la clave (AES-256-GCM con una llave derivada del secreto de la app) ----------

function key(secret: string) {
  return crypto.createHash("sha256").update(`${secret}:totp`).digest();
}

export function sealSecret(plain: string, appSecret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(appSecret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function openSecret(sealed: string, appSecret: string) {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Clave cifrada inválida");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(appSecret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
