/** Utilidades de códigos de barras (EAN/UPC) para etiquetas y códigos internos. */

export function ean13CheckDigit(first12: string) {
  const digits = first12.split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code: string) {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];
}

export function isValidEan8(code: string) {
  if (!/^\d{8}$/.test(code)) return false;
  const digits = code.slice(0, 7).split("").map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10) === code[7];
}

export function isValidUpcA(code: string) {
  return /^\d{12}$/.test(code) && isValidEan13(`0${code}`);
}

/** Simbología para imprimir: EAN/UPC si el código es válido, Code 128 en cualquier otro caso. */
export function symbologyFor(code: string): "ean13" | "ean8" | "upca" | "code128" {
  if (isValidEan13(code)) return "ean13";
  if (isValidEan8(code)) return "ean8";
  if (isValidUpcA(code)) return "upca";
  return "code128";
}

/**
 * Código interno de tienda: EAN-13 con prefijo 20 (rango reservado para uso interno
 * del comercio) y 10 dígitos aleatorios.
 */
export function internalEan13(random: () => number = Math.random) {
  let body = "20";
  for (let i = 0; i < 10; i++) body += Math.floor(random() * 10);
  return body + ean13CheckDigit(body);
}
