import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { GroupPhase } from "./useGroupCallSession";

function Ctrl({
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

type Props = {
  phase: GroupPhase;
  isVideo: boolean;
  mic: boolean;
  cam: boolean;
  speaker: boolean;
  free: number;
  onDecline: () => void;
  onJoin: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleSpeaker: () => void;
  onAdd: () => void;
  onLeave: () => void;
};

export default function GroupCallControls({
  phase,
  isVideo,
  mic,
  cam,
  speaker,
  free,
  onDecline,
  onJoin,
  onToggleMic,
  onToggleCam,
  onToggleSpeaker,
  onAdd,
  onLeave,
}: Props) {
  return (
    <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-4 lg:p-6">
      {phase === "ended" ? null : phase === "ringing" ? (
        <>
          <button
            onClick={onDecline}
            className="flex h-14 items-center gap-2 rounded-full bg-destructive px-6 font-head font-semibold text-destructive-foreground"
          >
            <Icon name="PhoneOff" size={20} />
            Отклонить
          </button>
          <button
            onClick={onJoin}
            className="flex h-14 items-center gap-2 rounded-full bg-online px-6 font-head font-semibold text-primary-foreground"
          >
            <Icon name={isVideo ? "Video" : "Phone"} size={20} />
            Присоединиться
          </button>
        </>
      ) : (
        <>
          <Ctrl dark={isVideo} active={mic} onClick={onToggleMic} icon={mic ? "Mic" : "MicOff"} label="Микрофон" />
          {isVideo && <Ctrl dark active={cam} onClick={onToggleCam} icon={cam ? "Video" : "VideoOff"} label="Камера" />}
          <Ctrl
            dark={isVideo}
            active={speaker}
            onClick={onToggleSpeaker}
            icon={speaker ? "Volume2" : "VolumeX"}
            label="Динамик"
          />
          {phase === "live" && free > 0 && <Ctrl dark={isVideo} active onClick={onAdd} icon="UserPlus" label="Добавить" />}
          <button
            onClick={onLeave}
            aria-label="Выйти"
            className="grid h-14 w-20 place-items-center rounded-full bg-destructive text-destructive-foreground"
          >
            <Icon name="PhoneOff" size={22} />
          </button>
        </>
      )}
    </div>
  );
}
