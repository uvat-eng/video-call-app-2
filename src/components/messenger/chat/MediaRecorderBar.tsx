import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { canRecord, extFor, fmtDur, pickMime, shrinkWave, type RecKind } from "@/lib/recorder";
import type { FileMeta } from "@/lib/payload";

type Props = {
  onSend: (file: File, extra: Partial<FileMeta>) => void;
  onError: (text: string) => void;
  onActive: (active: boolean) => void;
};

const MAX_SEC = 60;

export default function MediaRecorderBar({ onSend, onError, onActive }: Props) {
  const [mode, setMode] = useState<RecKind>("voice");
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [front, setFront] = useState(true);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const levels = useRef<number[]>([]);
  const startAt = useRef(0);
  const cancelRef = useRef(false);
  const timer = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pressAt = useRef(0);
  const holding = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [locked, setLocked] = useState(false);

  const release = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtx.current?.close().catch(() => null);
    audioCtx.current = null;
  };

  useEffect(() => () => {
    cancelRef.current = true;
    if (recRef.current?.state === "recording") recRef.current.stop();
    release();
  }, []);

  useEffect(() => {
    onActive(rec);
  }, [rec]);

  const start = async (kind: RecKind, facing = front) => {
    if (!canRecord()) {
      onError("Запись не поддерживается на этом устройстве");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        kind === "voice"
          ? { audio: { echoCancellation: true, noiseSuppression: true } }
          : {
              audio: { echoCancellation: true, noiseSuppression: true },
              video: { facingMode: facing ? "user" : "environment", width: { ideal: 480 }, height: { ideal: 480 } },
            },
      );
    } catch {
      onError(kind === "voice" ? "Нет доступа к микрофону — разрешите его в настройках" : "Нет доступа к камере или микрофону");
      return;
    }
    streamRef.current = stream;
    chunks.current = [];
    levels.current = [];
    cancelRef.current = false;
    const mime = pickMime(kind);
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        ...(kind === "voice" ? { audioBitsPerSecond: 48000 } : { videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 }),
      });
    } catch {
      release();
      onError("Не удалось начать запись");
      return;
    }
    recRef.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = () => {
      const dur = (Date.now() - startAt.current) / 1000;
      const type = mr.mimeType || mime || (kind === "voice" ? "audio/webm" : "video/webm");
      release();
      setRec(false);
      setSecs(0);
      setLevel(0);
      if (cancelRef.current || dur < 0.7) return;
      const blob = new Blob(chunks.current, { type: type.split(";")[0] });
      const base = type.split(";")[0];
      const name = `${kind === "voice" ? "voice" : "circle"}-${Date.now()}.${extFor(base)}`;
      onSend(new File([blob], name, { type: base }), {
        kind,
        dur: Math.round(dur),
        ...(kind === "voice" ? { wave: shrinkWave(levels.current) } : {}),
      });
    };

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        audioCtx.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const sample = () => {
          if (!audioCtx.current) return;
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) * (v - 128);
          const rms = Math.sqrt(sum / buf.length);
          levels.current.push(rms);
          setLevel(rms);
        };
        window.setTimeout(function loop() {
          if (!audioCtx.current) return;
          sample();
          window.setTimeout(loop, 80);
        }, 80);
      }
    } catch {
      /* без визуализации */
    }

    startAt.current = Date.now();
    mr.start(500);
    setRec(true);
    setSecs(0);
    if (!holding.current) setLocked(true);
    navigator.vibrate?.(30);
    timer.current = window.setInterval(() => {
      const s = (Date.now() - startAt.current) / 1000;
      setSecs(s);
      if (s >= MAX_SEC) stop(false);
    }, 200);
    if (kind === "circle") window.setTimeout(() => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    }, 0);
  };

  const stop = (cancel: boolean) => {
    cancelRef.current = cancel;
    const mr = recRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    else {
      release();
      setRec(false);
    }
  };

  const flip = async () => {
    const next = !front;
    setFront(next);
    const old = streamRef.current;
    if (!old) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next ? "user" : "environment", width: { ideal: 480 }, height: { ideal: 480 } },
      });
      const nt = s.getVideoTracks()[0];
      const ot = old.getVideoTracks()[0];
      if (!nt) return;
      old.removeTrack(ot);
      ot.stop();
      old.addTrack(nt);
      if (videoRef.current) videoRef.current.srcObject = old;
    } catch {
      return;
    }
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (rec) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pressAt.current = Date.now();
    holding.current = true;
    origin.current = { x: e.clientX, y: e.clientY };
    setLocked(false);
    window.setTimeout(() => {
      if (holding.current && !recRef.current?.state?.startsWith("rec")) start(mode);
    }, 250);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!holding.current || !origin.current || recRef.current?.state !== "recording") return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (dy < -70) {
      holding.current = false;
      setLocked(true);
      navigator.vibrate?.(15);
    } else if (dx < -110) {
      holding.current = false;
      stop(true);
    }
  };

  const onUp = () => {
    const wasHolding = holding.current;
    holding.current = false;
    const short = Date.now() - pressAt.current < 250;
    if (!wasHolding) return;
    if (short && !rec) {
      setMode((m) => (m === "voice" ? "circle" : "voice"));
      navigator.vibrate?.(10);
      return;
    }
    if (recRef.current?.state === "recording") stop(false);
  };

  const progress = Math.min(1, secs / MAX_SEC);

  return (
    <>
      {rec && mode === "circle" && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-black/70 backdrop-blur-sm">
          <div className="relative h-[min(78vw,320px)] w-[min(78vw,320px)]">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" />
              <circle
                cx="50"
                cy="50"
                r="48.5"
                fill="none"
                stroke="hsl(var(--badge))"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={304.7}
                strokeDashoffset={304.7 * (1 - progress)}
              />
            </svg>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cn("absolute inset-[6px] h-[calc(100%-12px)] w-[calc(100%-12px)] rounded-full bg-black object-cover", front && "-scale-x-100")}
            />
          </div>
          <div className="flex items-center gap-2 text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {fmtDur(secs)}
          </div>
          {!locked && <p className="text-center text-[.85em] text-white/70">Отпустите — отправить · вверх — закрепить · влево — отмена</p>}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => stop(true)} className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white" aria-label="Отменить">
              <Icon name="Trash2" size={22} />
            </button>
            <button type="button" onClick={flip} className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white" aria-label="Сменить камеру">
              <Icon name="SwitchCamera" size={22} />
            </button>
            <button type="button" onClick={() => stop(false)} className="grid h-16 w-16 place-items-center rounded-full bg-badge text-badge-foreground" aria-label="Отправить">
              <Icon name="SendHorizontal" size={24} />
            </button>
          </div>
        </div>
      )}

      {rec && mode === "voice" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex min-h-[58px] items-center gap-3 bg-chat-bg px-3 pb-safe">
          <button type="button" onClick={() => stop(true)} className="grid h-10 w-10 place-items-center rounded-full text-destructive" aria-label="Отменить">
            <Icon name="Trash2" size={22} />
          </button>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="w-12 tabular-nums text-foreground">{fmtDur(secs)}</span>
          {!locked && (
            <span className="flex items-center gap-1 text-[.8em] text-muted-foreground">
              <Icon name="ChevronLeft" size={14} />
              отмена · вверх — закрепить
            </span>
          )}
          <span className={cn("h-8 flex-1 items-center gap-[2px] overflow-hidden", locked ? "flex" : "hidden sm:flex")}>
            {levels.current.slice(-50).map((v, i) => (
              <span key={i} className="w-[3px] shrink-0 rounded-full bg-badge" style={{ height: `${Math.max(3, Math.min(30, v * 1.6))}px` }} />
            ))}
            <span className="sr-only">{level}</span>
          </span>
          <button
            type="button"
            onClick={() => stop(false)}
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-badge text-badge-foreground shadow"
            aria-label="Отправить"
          >
            <Icon name="SendHorizontal" size={21} />
          </button>
        </div>
      )}

      <button
        type="button"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerMove={onMove}
        onPointerCancel={() => {
          if (holding.current && recRef.current?.state === "recording") {
            holding.current = false;
            setLocked(true);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={mode === "voice" ? "Голосовое сообщение" : "Видеосообщение"}
        title="Нажмите, чтобы переключить. Удерживайте, чтобы записать"
        className="grid h-[46px] w-[46px] shrink-0 touch-none select-none place-items-center rounded-full bg-badge text-badge-foreground shadow transition-transform active:scale-110 [-webkit-touch-callout:none]"
      >
        <Icon name={mode === "voice" ? "Mic" : "Video"} size={22} />
      </button>
    </>
  );
}
