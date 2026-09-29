"use client";

import { useText } from "@/lib/client/i18n";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface BarcodeDetectorClass {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorClass;
  }
}

/** Códigos de tienda (EAN/UPC), de uso interno (128/39) y QR. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/**
 * Cámara trasera con más resolución que la que da el navegador por omisión (640×480): con menos,
 * las barras de un EAN-13 salen borrosas y no se leen.
 */
const CAMERA: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

/**
 * Formatos que el detector nativo sí sabe leer. En algunos Android existe BarcodeDetector pero sin
 * formatos (p. ej. sin servicios de Google): ahí no lee nada y hay que usar ZXing.
 */
async function nativeFormats(): Promise<string[]> {
  const Detector = window.BarcodeDetector;
  if (!Detector) return [];
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? [];
    return FORMATS.filter((f) => supported.includes(f));
  } catch {
    return [];
  }
}

/** Enfoque automático continuo, si la cámara lo permite (muchas se quedan enfocadas al infinito). */
async function focusContinuously(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0];
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
  if (!caps.focusMode?.includes("continuous")) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
  } catch {
    // La cámara no aceptó el cambio: se queda como estaba.
  }
}

interface ScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Escanea códigos de barras con la cámara. Usa la API nativa BarcodeDetector cuando sabe leer
 * EAN-13 (Chrome en Android) y ZXing en los demás casos (iOS/Safari, Firefox, Android sin formatos).
 */
export function BarcodeScanner(props: ScannerProps) {
  return props.open ? <Scanner {...props} /> : null;
}

function Scanner({ open, onClose, onDetected }: ScannerProps) {
  const tr = useText();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref para no reiniciar la cámara cada vez que el padre vuelve a renderizar.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let zxingControls: { stop: () => void } | null = null;

    const finish = (code: string) => {
      if (stopped) return;
      stopped = true;
      navigator.vibrate?.(80);
      onDetectedRef.current(code);
    };

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      try {
        const formats = await nativeFormats();
        if (stopped) return;
        if (window.BarcodeDetector && formats.includes("ean_13")) {
          stream = await navigator.mediaDevices.getUserMedia(CAMERA);
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          video.srcObject = stream;
          await video.play();
          await focusContinuously(stream);
          const detector = new window.BarcodeDetector({ formats });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) return finish(codes[0].rawValue);
            } catch {
              // Cuadro no listo todavía.
            }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
          const controls = await reader.decodeFromConstraints(CAMERA, video, (result) => {
            if (result) finish(result.getText());
          });
          if (stopped) return controls.stop();
          zxingControls = controls;
          await focusContinuously(video.srcObject as MediaStream | null);
        }
      } catch (err) {
        if (stopped) return;
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError"
            ? "Permite el acceso a la cámara para escanear."
            : "No se pudo abrir la cámara. Escribe el código manualmente."
        );
      }
    }
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={tr("Escanear código")}>
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80" aria-hidden="true" />
          </div>
        )}
        <p className="text-xs text-slate-500">
          {tr(
            "Apunta la cámara al código de barras. También puedes usar un lector USB o Bluetooth: escanea directamente en el buscador."
          )}
        </p>
      </div>
    </Modal>
  );
}
