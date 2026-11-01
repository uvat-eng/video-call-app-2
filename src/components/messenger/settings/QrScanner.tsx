import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Icon from "@/components/ui/icon";

type Props = { onCode: (code: string) => void; onClose: () => void };

export function extractCode(text: string) {
  const m = text.match(/[?&]link=([A-Z0-9]{8})/i) ?? text.trim().match(/^([A-Z0-9]{8})$/i);
  return m ? m[1].toUpperCase() : "";
}

export default function QrScanner({ onCode, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

    const found = (text: string) => {
      const code = extractCode(text);
      if (!code || stopped) return false;
      stopped = true;
      onCode(code);
      return true;
    };

    const tick = async () => {
      const v = videoRef.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const res = await detector.detect(v);
            if (res[0] && found(res[0].rawValue)) return;
          } else if (ctx) {
            const w = Math.min(640, v.videoWidth);
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const r = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (r && found(r.data)) return;
          }
        } catch {
          /* следующий кадр */
        }
      }
      raf = window.setTimeout(tick, 150);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = s;
        v.play().catch(() => undefined);
        tick();
      })
      .catch(() => setError("Нет доступа к камере. Разрешите камеру в настройках браузера или введите код вручную."));

    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <span className="font-head font-semibold">Наведите камеру на QR-код</span>
        <button onClick={onClose} aria-label="Закрыть" className="rounded-full bg-white/15 p-2.5">
          <Icon name="X" size={20} />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-[min(70vw,300px)] w-[min(70vw,300px)] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-8 rounded-2xl bg-black/80 p-4 text-center text-[.9em]">{error}</div>
        )}
      </div>
      <p className="p-4 text-center text-[.85em] text-white/70">
        QR-код показан на компьютере, где вы вошли в RuChat
      </p>
    </div>
  );
}
