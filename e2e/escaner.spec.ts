import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { login, OWNER } from "./helpers";

// Lector de códigos con la cámara: Chromium usa como cámara un video con un EAN-13 (Coca-Cola 600ml
// de los datos de demostración) y se prueba cada camino del lector.

const CODE = "7501055300075";

/** Video .y4m de un cuadro con el código EAN-13 dibujado, para la cámara falsa de Chromium. */
function barcodeVideo(code: string) {
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
  const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  const d = [...code].map(Number);
  let bits = "101";
  d.slice(1, 7).forEach((x, i) => (bits += (parity[d[0]][i] === "L" ? L : G)[x]));
  bits += "01010";
  d.slice(7).forEach((x) => (bits += R[x]));
  bits += "101";

  const W = 640;
  const H = 480;
  const moduleWidth = 3;
  const x0 = Math.floor((W - bits.length * moduleWidth) / 2);
  const row = Buffer.alloc(W, 235);
  [...bits].forEach((b, i) => {
    if (b === "1") row.fill(20, x0 + i * moduleWidth, x0 + (i + 1) * moduleWidth);
  });
  const blank = Buffer.alloc(W, 235);
  const luma = Buffer.concat(Array.from({ length: H }, (_, y) => (y > H / 3 && y < (2 * H) / 3 ? row : blank)));
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const file = join(tmpdir(), `camara-ean-${code}.y4m`);
  writeFileSync(
    file,
    Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), luma, chroma, chroma])
  );
  return file;
}

test.use({
  permissions: ["camera"],
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${barcodeVideo(CODE)}`,
    ],
  },
});

const scenarios = {
  // Safari/iPhone y Firefox: no hay detector nativo y se usa ZXing.
  "sin detector nativo": null,
  // Algunos Android traen BarcodeDetector sin formatos: no lee nada y hay que usar ZXing.
  "detector nativo sin formatos": `window.BarcodeDetector = class {
    static async getSupportedFormats() { return []; }
    async detect() { return []; }
  };`,
  // Chrome en Android con el detector completo.
  "detector nativo con EAN-13": `window.BarcodeDetector = class {
    static async getSupportedFormats() { return ["ean_13", "qr_code"]; }
    async detect(video) { return video.videoWidth ? [{ rawValue: "${CODE}" }] : []; }
  };`,
};

for (const [name, detector] of Object.entries(scenarios)) {
  test(`escanear con la cámara en el punto de venta: ${name}`, async ({ page }) => {
    if (detector) await page.addInitScript(detector);
    await login(page, OWNER);
    await page.goto("/ventas");
    // Se escanea con el catálogo ya cargado, como en la tienda.
    const card = page.getByRole("button", { name: /^Coca-Cola 600ml/ });
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Escanear con la cámara" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Escanear código" });
    await expect(dialog).toBeVisible();
    // Al leer el código se cierra la ventana y el producto entra a la venta.
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(`No hay producto con el código ${CODE}`)).toHaveCount(0);
    await expect(card).toContainText("1 en carrito");
  });
}
