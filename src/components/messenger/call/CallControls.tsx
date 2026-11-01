import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CallSession } from "./useCallSession";

type Props = { session: CallSession };

export default function CallControls({ session }: Props) {
  const { isVideo, phase, mic, setMic, cam, setCam, speaker, setSpeaker, noCamera, accept, hangup } = session;

  return (
    <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-5 lg:p-7">
      {phase === "ended" ? null : phase === "ringing" ? (
        <>
          <button
            onClick={hangup}
            className="flex h-14 items-center gap-2 rounded-full bg-destructive px-6 font-head font-semibold text-destructive-foreground transition-transform hover:scale-105"
          >
            <Icon name="PhoneOff" size={20} />
            Отклонить
          </button>
          <button
            onClick={accept}
            className="flex h-14 items-center gap-2 rounded-full bg-online px-6 font-head font-semibold text-primary-foreground transition-transform hover:scale-105"
          >
            <Icon name={isVideo ? "Video" : "Phone"} size={20} />
            Принять
          </button>
        </>
      ) : (
        <>
          <CtrlButton
            dark={isVideo}
            active={mic}
            onClick={() => setMic((v) => !v)}
            icon={mic ? "Mic" : "MicOff"}
            label={mic ? "Микрофон" : "Без звука"}
          />
          {isVideo && (
            <CtrlButton
              dark
              active={cam && !noCamera}
              onClick={() => !noCamera && setCam((v) => !v)}
              icon={cam && !noCamera ? "Video" : "VideoOff"}
              label="Камера"
            />
          )}
          <CtrlButton
            dark={isVideo}
            active={speaker}
            onClick={() => setSpeaker((v) => !v)}
            icon={speaker ? "Volume2" : "VolumeX"}
            label="Динамик"
          />
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
