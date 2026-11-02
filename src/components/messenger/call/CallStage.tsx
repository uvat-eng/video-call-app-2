import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import UserAvatar from "../UserAvatar";
import { fmt, type ActiveCall, type CallSession } from "./useCallSession";

type Props = { call: ActiveCall; session: CallSession };

export default function CallStage({ call, session }: Props) {
  const { isVideo, phase, cam, seconds, noCamera, reconnecting, route, localRef, remoteRef, statusText, showRemote } =
    session;

  return (
    <>
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={cn("absolute inset-0 h-full w-full bg-black object-cover", !showRemote && "pointer-events-none opacity-0")}
      />

      <div className="relative z-10 flex items-center justify-between p-5 lg:p-7">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name={isVideo ? "Video" : "Phone"} size={18} />
          RuChat · {isVideo ? "Видео" : "Аудио"}
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[.8em] font-medium",
            isVideo ? "bg-primary-foreground/15" : "bg-card",
          )}
        >
          <Icon name={route === "direct" && !reconnecting ? "ShieldCheck" : "Lock"} size={12} />
          {phase === "live" && !reconnecting && route === "direct"
            ? "Прямое соединение, зашифровано"
            : phase === "live" && reconnecting
              ? "Восстанавливаем прямое соединение"
              : "Сквозное шифрование"}
        </span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
        {!showRemote && (
          <>
            <div className="relative">
              {(phase === "ringing" || phase === "calling") &&
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
              <UserAvatar user={call.peer} hideOnline size={128} className="relative" />
            </div>
            <div className="relative">
              <h2 className="hero-title text-[2em]">{call.peer.name}</h2>
              <p
                className={cn(
                  "mt-2 font-head text-[1.1em] tabular-nums",
                  isVideo ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {statusText}
              </p>
            </div>
          </>
        )}
        {showRemote && (
          <span className="absolute left-5 top-0 rounded-full bg-black/40 px-3 py-1 font-head text-[.9em] tabular-nums text-white lg:left-7">
            {call.peer.name} · {reconnecting ? "Восстанавливаем связь…" : fmt(seconds)}
          </span>
        )}
      </div>

      {isVideo && phase !== "ringing" && phase !== "ended" && (
        <div className="absolute bottom-28 right-4 z-10 aspect-[3/4] w-28 overflow-hidden rounded-xl border border-primary-foreground/20 bg-foreground/60 sm:w-40 lg:bottom-32 lg:right-7 lg:w-48">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className={cn("h-full w-full -scale-x-100 object-cover", (!cam || noCamera) && "hidden")}
          />
          {(!cam || noCamera) && (
            <div className="grid h-full place-items-center p-3 text-center text-[.75em] text-primary-foreground/70">
              <div>
                <Icon name="VideoOff" size={22} className="mx-auto mb-1.5" />
                {noCamera ? "Нет доступа к камере" : "Камера выключена"}
              </div>
            </div>
          )}
          <span className="absolute bottom-1.5 left-2 text-[.7em] text-primary-foreground/80">Вы</span>
        </div>
      )}
    </>
  );
}
