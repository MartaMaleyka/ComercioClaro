"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

interface ScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Escanea códigos de barras con la cámara. Usa la API nativa BarcodeDetector cuando existe
 * (Chrome/Android) y ZXing como respaldo (iOS/Safari, Firefox).
 */
export function BarcodeScanner(props: ScannerProps) {
  return props.open ? <Scanner {...props} /> : null;
}

function Scanner({ open, onClose, onDetected }: ScannerProps) {
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
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          video.srcObject = stream;
          await video.play();
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
          });
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
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" } },
            video,
            (result) => {
              if (result) finish(result.getText());
            }
          );
        }
      } catch (err) {
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
    <Modal open={open} onClose={onClose} title="Escanear código">
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
          Apunta la cámara al código de barras. También puedes usar un lector USB o Bluetooth: escanea directamente en
          el buscador.
        </p>
      </div>
    </Modal>
  );
}
