import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CallKind, Contact } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

export type ActiveCall = {
  contact: Contact;
  kind: CallKind;
  incoming: boolean;
};

type Props = {
  call: ActiveCall;
  onEnd: (seconds: number, accepted: boolean) => void;
};

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function CallScreen({ call, onEnd }: Props) {
  const [phase, setPhase] = useState<"ringing" | "connecting" | "live">(call.incoming ? "ringing" : "connecting");
  const [kind, setKind] = useState<CallKind>(call.kind);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(call.kind === "video");
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [camError, setCamError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // исходящий: имитируем гудки и соединение
  useEffect(() => {
    if (phase !== "connecting") return;
    const t = window.setTimeout(() => setPhase("live"), 2200);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // локальная камера
  useEffect(() => {
    const wantVideo = kind === "video" && cam && phase !== "ringing";
    if (!wantVideo) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCamError(false);
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCamError(true));
    return () => {
      cancelled = true;
    };
  }, [kind, cam, phase]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const hangup = () => onEnd(seconds, phase !== "ringing");

  const statusText =
    phase === "ringing"
      ? kind === "video"
        ? "Входящий видеозвонок"
        : "Входящий аудиозвонок"
      : phase === "connecting"
        ? "Вызов…"
        : fmt(seconds);

  const isVideo = kind === "video";

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in items-center justify-center bg-foreground/40 p-2.5 backdrop-blur-sm duration-200 lg:p-10">
      <div
        className={cn(
          "relative flex h-full max-h-[760px] w-full max-w-[1100px] flex-col overflow-hidden rounded-[14px]",
          isVideo ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-tile-a to-tile-b text-foreground",
        )}
      >
        {/* верх */}
        <div className="relative z-10 flex items-center justify-between p-5 lg:p-7">
          <div className="flex items-center gap-2 font-head font-semibold">
            <Icon name={isVideo ? "Video" : "Phone"} size={18} />
            RusAPP · {isVideo ? "Видео" : "Аудио"}
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[.8em] font-medium",
              isVideo ? "bg-primary-foreground/15" : "bg-card",
            )}
          >
            <Icon name="Lock" size={12} />
            Защищено
          </span>
        </div>

        {/* центр */}
        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
          {isVideo && phase === "live" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,hsl(var(--accent)/0.35),transparent_60%)]" />
            </div>
          )}
          <div className="relative">
            {phase !== "live" &&
              [0, 0.5].map((d) => (
                <span
                  key={d}
                  className={cn(
                    "absolute inset-0 animate-ring-pulse rounded-full",
                    isVideo ? "bg-accent/50" : "bg-primary/25",
                  )}
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            <UserAvatar
              contact={{ ...call.contact, online: false }}
              size={128}
              className="relative"
            />
          </div>
          <div className="relative">
            <h2 className="hero-title">{call.contact.name}</h2>
            <p className={cn("mt-2 font-head text-[1.1em] tabular-nums", isVideo ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {statusText}
            </p>
          </div>
        </div>

        {/* превью своей камеры */}
        {isVideo && phase !== "ringing" && (
          <div className="absolute bottom-28 right-4 z-10 aspect-[3/4] w-28 overflow-hidden rounded-xl border border-primary-foreground/20 bg-foreground/60 sm:w-40 lg:bottom-32 lg:right-7 lg:w-48">
            <video ref={videoRef} autoPlay playsInline muted className={cn("h-full w-full -scale-x-100 object-cover", (!cam || camError) && "hidden")} />
            {(!cam || camError) && (
              <div className="grid h-full place-items-center p-3 text-center text-[.75em] text-primary-foreground/70">
                <div>
                  <Icon name="VideoOff" size={22} className="mx-auto mb-1.5" />
                  {camError && cam ? "Нет доступа к камере" : "Камера выключена"}
                </div>
              </div>
            )}
            <span className="absolute bottom-1.5 left-2 text-[.7em] text-primary-foreground/80">Вы</span>
          </div>
        )}

        {/* кнопки */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-5 lg:p-7">
          {phase === "ringing" ? (
            <>
              <button
                onClick={hangup}
                className="flex h-14 items-center gap-2 rounded-full bg-destructive px-6 font-head font-semibold text-destructive-foreground transition-transform hover:scale-105"
              >
                <Icon name="PhoneOff" size={20} />
                Отклонить
              </button>
              <button
                onClick={() => setPhase("live")}
                className="flex h-14 items-center gap-2 rounded-full bg-online px-6 font-head font-semibold text-primary-foreground transition-transform hover:scale-105"
              >
                <Icon name={isVideo ? "Video" : "Phone"} size={20} />
                Принять
              </button>
            </>
          ) : (
            <>
              <CtrlButton dark={isVideo} active={mic} onClick={() => setMic((v) => !v)} icon={mic ? "Mic" : "MicOff"} label={mic ? "Микрофон" : "Без звука"} />
              <CtrlButton
                dark={isVideo}
                active={isVideo && cam}
                onClick={() => {
                  if (!isVideo) {
                    setKind("video");
                    setCam(true);
                  } else setCam((v) => !v);
                }}
                icon={isVideo && cam ? "Video" : "VideoOff"}
                label="Камера"
              />
              <CtrlButton dark={isVideo} active={speaker} onClick={() => setSpeaker((v) => !v)} icon={speaker ? "Volume2" : "VolumeX"} label="Динамик" />
              <button
                onClick={hangup}
                aria-label="Завершить"
                className="grid h-14 w-20 place-items-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105"
              >
                <Icon name="PhoneOff" size={22} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  active,
  onClick,
  icon,
  label,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-14 w-14 place-items-center rounded-full transition-all hover:scale-105",
        dark
          ? active
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-primary-foreground text-primary"
          : active
            ? "bg-card text-foreground"
            : "bg-foreground text-background",
      )}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
