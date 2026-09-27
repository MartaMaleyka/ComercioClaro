import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  openSecret,
  otpauthUrl,
  sealSecret,
  totpCode,
  verifyTotp,
} from "@/lib/totp";
import { isCommonPassword } from "@/lib/password-policy";
import { clientIp } from "@/lib/api";
import { password } from "@/lib/validation";

// Clave del RFC 6238 (SHA-1): "12345678901234567890" en base32.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("verificación en dos pasos (TOTP)", () => {
  it("coincide con los vectores del RFC 6238 (6 dígitos)", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(RFC_SECRET, 59_000)).toBe("287082");
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe("005924");
    expect(totpCode(RFC_SECRET, 2_000_000_000_000)).toBe("279037");
  });

  it("acepta el código de ±30 s y rechaza los demás", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now).replace(/(\d{3})/, "$1 "), now)).toBe(true);
  });

  it("base32 va y vuelve, y las claves nuevas son de 160 bits", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(otpauthUrl(secret, "rosa@test.dev")).toBe(
      `otpauth://totp/ComercioClaro%3Arosa%40test.dev?secret=${secret}&issuer=ComercioClaro&algorithm=SHA1&digits=6&period=30`
    );
  });

  it("la clave se guarda cifrada y no se abre con otro secreto ni alterada", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP", "secreto-de-la-app-de-32-caracteres!");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed, "secreto-de-la-app-de-32-caracteres!")).toBe("JBSWY3DPEHPK3PXP");
    expect(() => openSecret(sealed, "otro-secreto-de-la-app-de-32-car!!")).toThrow();
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => openSecret(tampered, "secreto-de-la-app-de-32-caracteres!")).toThrow();
  });

  it("los códigos de recuperación son únicos y aceptan minúsculas o sin guion", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeRecoveryCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeRecoveryCode(" ABCD EFGH ")).toBe("ABCDEFGH");
  });
});

describe("contraseñas", () => {
  it("rechaza las más comunes y las series", () => {
    for (const p of ["12345678", "password", "Contraseña", "comercioclaro", "aaaaaaaa", "23456789", "98765432"]) {
      expect(isCommonPassword(p)).toBe(true);
    }
    for (const p of ["Clave-Segura-2026", "mi tienda de la esquina", "13572468"]) {
      expect(isCommonPassword(p)).toBe(false);
    }
    expect(password.safeParse("12345678").success).toBe(false);
    expect(password.safeParse("Clave-Segura-2026").success).toBe(true);
  });
});

describe("IP del cliente detrás de un proxy", () => {
  const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

  it("toma la IP que agregó el último proxy (la que no puede inventar el cliente)", () => {
    expect(clientIp(request({ "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(request({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(request({}))).toBe("unknown");
  });

  it("con dos proxys de confianza toma la penúltima", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    try {
      expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 4.4.4.4, 10.0.0.1" }))).toBe("4.4.4.4");
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS;
    }
  });
});
