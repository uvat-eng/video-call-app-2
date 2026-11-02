import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { loadDecrypted } from "@/lib/files";
import { fmtDur } from "@/lib/recorder";
import type { FileMeta } from "@/lib/payload";

let current: HTMLMediaElement | null = null;

export function claimPlayback(el: HTMLMediaElement) {
  if (current && current !== el) current.pause();
  current = el;
}

export default function VoiceBubble({ meta }: { meta: FileMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const wantPlay = useRef(false);
  const dur = meta.dur || 0;
  const wave = meta.wave?.length ? meta.wave : Array(40).fill(8);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  useEffect(() => {
    if (url && wantPlay.current && audio.current) {
      wantPlay.current = false;
      claimPlayback(audio.current);
      audio.current.play().catch(() => setPlaying(false));
    }
  }, [url]);

  const toggle = async () => {
    const el = audio.current;
    if (url && el) {
      if (el.paused) {
        claimPlayback(el);
        el.play().catch(() => null);
      } else el.pause();
      return;
    }
    setState("loading");
    try {
      const b = await loadDecrypted(meta);
      wantPlay.current = true;
      setUrl(URL.createObjectURL(b));
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !url) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const total = Number.isFinite(el.duration) ? el.duration : dur;
    if (total) el.currentTime = k * total;
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const total = dur || 1;
  const progress = Math.min(1, pos / total);

  return (
    <div className="flex w-[250px] max-w-full items-center gap-2.5 px-1 pt-1">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Пауза" : "Слушать"}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-badge text-badge-foreground"
      >
        <Icon
          name={state === "loading" ? "Loader2" : state === "error" ? "RotateCw" : playing ? "Pause" : "Play"}
          size={20}
          className={cn(state === "loading" && "animate-spin", !playing && state === "idle" && "translate-x-[1px]")}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {wave.map((h, i) => (
            <span
              key={i}
              className={cn("w-[3px] shrink-0 rounded-full", i / wave.length < progress ? "bg-badge" : "bg-foreground/25")}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-[.72em] opacity-70">
          <span className="tabular-nums">{state === "error" ? "Ошибка загрузки" : fmtDur(playing || pos ? pos : dur)}</span>
          {url && (
            <button type="button" onClick={cycleRate} className="rounded-full bg-foreground/10 px-1.5 font-semibold">
              {rate}x
            </button>
          )}
        </div>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          className="hidden"
        />
      )}
    </div>
  );
}
