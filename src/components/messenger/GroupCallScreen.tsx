import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import type { E2E } from "@/lib/e2e";
import UserAvatar from "./UserAvatar";
import ContactPicker from "./ContactPicker";
import GroupTile from "./groupcall/GroupTile";
import GroupCallControls from "./groupcall/GroupCallControls";
import { useGroupCallSession, type ActiveGroup } from "./groupcall/useGroupCallSession";

export { MAX_GROUP, MAX_VIDEO, type ActiveGroup } from "./groupcall/useGroupCallSession";

type Props = {
  group: ActiveGroup;
  me: User;
  token: string;
  e2e: E2E;
  contacts: User[];
  onClose: () => void;
};

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function GroupCallScreen({ group, me, token, e2e, contacts, onClose }: Props) {
  const {
    isVideo,
    phase,
    endText,
    members,
    mic,
    setMic,
    cam,
    camNote,
    speaker,
    setSpeaker,
    seconds,
    remoteCams,
    remoteMics,
    connected,
    picker,
    setPicker,
    peersRef,
    camTrackRef,
    finish,
    join,
    toggleCam,
    invite,
    tiles,
    cols,
    memberIds,
    free,
  } = useGroupCallSession({ group, me, token, e2e, onClose });

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden",
          isVideo ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-tile-a to-tile-b text-foreground",
        )}
      >
        <div className="relative z-10 flex items-center justify-between gap-3 p-4 lg:p-6">
          <div className="flex min-w-0 items-center gap-2 font-head font-semibold">
            <Icon name="Users" size={18} />
            <span className="truncate">
              Групповой {isVideo ? "видеозвонок" : "аудиозвонок"}
              {phase === "live" && ` · ${fmt(seconds)}`}
            </span>
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[3px] text-[.8em] font-medium",
              isVideo ? "bg-primary-foreground/15" : "bg-card",
            )}
          >
            <Icon name="ShieldCheck" size={12} />
            Напрямую, зашифровано
          </span>
        </div>

        {phase === "ringing" || phase === "ended" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
            <div className="relative">
              {phase === "ringing" &&
                [0, 0.5].map((d) => (
                  <span
                    key={d}
                    className={cn("absolute inset-0 animate-ring-pulse rounded-full", isVideo ? "bg-accent/50" : "bg-primary/25")}
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              {group.incoming && <UserAvatar user={group.incoming.host} hideOnline size={128} className="relative" />}
            </div>
            <div>
              <h2 className="hero-title">{group.incoming?.host.name ?? "Групповой звонок"}</h2>
              <p className={cn("mt-2 font-head text-[1.1em]", isVideo ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {phase === "ended"
                  ? endText
                  : `Приглашает в групповой ${isVideo ? "видеозвонок" : "аудиозвонок"} · ${group.incoming?.total ?? 0} участников`}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-3 pb-2 lg:px-6"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(140px, 1fr)" }}
          >
            {tiles.map((m) => {
              const isMe = m.user.id === me.id;
              const peer = peersRef.current.get(m.user.id);
              const showVideo = isVideo && (isMe ? cam : remoteCams[m.user.id] && connected[m.user.id]);
              const micOn = isMe ? mic : remoteMics[m.user.id] !== false;
              return (
                <GroupTile
                  key={m.user.id}
                  user={m.user}
                  label={isMe ? "Вы" : m.user.name}
                  stream={isMe ? null : (peer?.stream ?? null)}
                  localTrack={isMe ? camTrackRef.current : null}
                  showVideo={!!showVideo}
                  muted={isMe || !speaker}
                  micOn={micOn}
                  dark={isVideo}
                  status={
                    isMe
                      ? ""
                      : m.state === "invited"
                        ? "Вызов…"
                        : connected[m.user.id]
                          ? ""
                          : "Соединение…"
                  }
                />
              );
            })}
          </div>
        )}

        {camNote && (
          <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground/80 px-4 py-2 text-[.85em] text-background">
            {camNote}
          </div>
        )}

        <GroupCallControls
          phase={phase}
          isVideo={isVideo}
          mic={mic}
          cam={cam}
          speaker={speaker}
          free={free}
          onDecline={() => finish("Звонок отклонён", true)}
          onJoin={join}
          onToggleMic={() => setMic((v) => !v)}
          onToggleCam={toggleCam}
          onToggleSpeaker={() => setSpeaker((v) => !v)}
          onAdd={() => setPicker(true)}
          onLeave={() => finish("Вы вышли из звонка", true)}
        />
      </div>

      {picker && (
        <ContactPicker
          title="Добавить в звонок"
          contacts={contacts.filter((c) => !memberIds.has(c.id) || members.find((m) => m.user.id === c.id && m.state !== "joined" && m.state !== "invited"))}
          max={free}
          kind={group.kind}
          onCancel={() => setPicker(false)}
          onConfirm={(users) => invite(users)}
          confirmLabel="Пригласить"
        />
      )}
    </div>
  );
}
