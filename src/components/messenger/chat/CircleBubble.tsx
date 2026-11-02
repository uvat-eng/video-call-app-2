import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loadDecrypted } from "@/lib/files";
import { fmtDur } from "@/lib/recorder";
import type { FileMeta } from "@/lib/payload";
import { claimPlayback } from "./VoiceBubble";

export default function CircleBubble({ meta }: { meta: FileMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const dur = meta.dur || 0;

  useEffect(() => {
    let obj = "";
    let alive = true;
    loadDecrypted(meta)
      .then((b) => {
        if (!alive) return;
        obj = URL.createObjectURL(b);
        setUrl(obj);
        setState("idle");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [meta.urls[0]]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      el.muted = false;
      claimPlayback(el);
      el.play().catch(() => null);
    } else el.pause();
  };

  const progress = dur ? Math.min(1, pos / dur) : 0;

  return (
    <button
      type="button"
      onClick={toggle}
      className="relative block h-[220px] w-[220px] overflow-hidden rounded-full bg-black/80 shadow-md"
      aria-label={playing ? "Пауза" : "Смотреть видеосообщение"}
    >
      {url && (
        <video
          ref={video}
          src={`${url}#t=0.1`}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          className="h-full w-full object-cover"
        />
      )}
      <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        {playing && (
          <circle
            cx="50"
            cy="50"
            r="48.5"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={304.7}
            strokeDashoffset={304.7 * (1 - progress)}
          />
        )}
      </svg>
      {!playing && (
        <span className="absolute inset-0 grid place-items-center">
          <span className={cn("grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white")}>
            <Icon
              name={state === "loading" ? "Loader2" : state === "error" ? "VideoOff" : "Play"}
              size={22}
              className={cn(state === "loading" && "animate-spin", state === "idle" && "translate-x-[1px]")}
            />
          </span>
        </span>
      )}
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2 py-0.5 text-[.72em] tabular-nums text-white">
        {fmtDur(playing ? pos : dur)}
      </span>
    </button>
  );
}
