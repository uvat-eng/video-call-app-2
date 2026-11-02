import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  duration,
  longTime,
  type CallKind,
  type CallRecord,
  type GroupCallRecord,
  type User,
} from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  calls: CallRecord[];
  groupCalls: GroupCallRecord[];
  loaded: boolean;
  onCall: (user: User, kind: CallKind) => void;
  onGroup: () => void;
};

type Row = (CallRecord & { group?: false }) | GroupCallRecord;

const DIR: Record<CallRecord["direction"], { icon: string; label: string }> = {
  in: { icon: "PhoneIncoming", label: "Входящий" },
  out: { icon: "PhoneOutgoing", label: "Исходящий" },
  missed: { icon: "PhoneMissed", label: "Пропущенный" },
};

export default function CallsView({ calls, groupCalls, loaded, onCall, onGroup }: Props) {
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const all: Row[] = [...calls, ...groupCalls].sort((a, b) => b.at.localeCompare(a.at));
  const list = all.filter((c) => filter === "all" || c.direction === "missed");
  const video = all.filter((c) => c.kind === "video").length;
  const missed = all.filter((c) => c.direction === "missed").length;
  const totalMin = Math.round(all.reduce((s, c) => s + c.seconds, 0) / 60);

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-card pb-24">
      <div className="flex gap-2 px-4 pb-2 text-[.88em]">
        {(
          [
            ["all", "Все"],
            ["missed", missed ? `Пропущенные ${missed}` : "Пропущенные"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 font-medium transition-colors",
              filter === id ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <button onClick={onGroup} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-secondary">
        <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-badge text-badge-foreground">
          <Icon name="Link" size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">Групповой звонок</span>
          <span className="block text-[.88em] text-muted-foreground">До 20 человек, видео до 6</span>
        </span>
      </button>
      <div className="px-4 pb-1 pt-4 font-medium">Недавние</div>
      {!loaded && (
        <div className="grid place-items-center py-10 text-muted-foreground">
          <Icon name="Loader2" size={22} className="animate-spin" />
        </div>
      )}
      {loaded && list.length === 0 && (
        <p className="px-4 py-10 text-center text-muted-foreground">
          {filter === "missed" ? "Пропущенных нет" : "Звонков пока не было"}
        </p>
      )}
      {list.map((c) => {
        const d = DIR[c.direction];
        const dur = duration(c.seconds);
        const isMissed = c.direction === "missed";
        const sub = (
          <span className="flex items-center gap-1.5 truncate text-[.88em] text-muted-foreground">
            <Icon
              name={d.icon}
              size={15}
              className={cn("shrink-0", isMissed ? "text-destructive" : "text-badge")}
            />
            <span className="truncate">
              {c.group ? `Группа · ${c.total} участн. · ` : ""}
              {longTime(c.at)}
              {dur && ` · ${dur}`}
            </span>
          </span>
        );
        if (c.group) {
          return (
            <div key={`g${c.id}`} className="flex items-center gap-3 px-4">
              <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Icon name="Users" size={24} />
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2 border-b border-border py-3">
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", isMissed && "text-destructive")}>
                    {c.names || "Групповой звонок"}
                  </div>
                  {sub}
                </div>
                <Icon name={c.kind === "video" ? "Video" : "Phone"} size={20} className="shrink-0 text-muted-foreground" />
              </div>
            </div>
          );
        }
        return (
          <div key={c.id} className="flex items-center gap-3 px-4">
            <UserAvatar user={c.peer} size={50} />
            <div className="flex min-w-0 flex-1 items-center gap-2 border-b border-border py-3">
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-medium", isMissed && "text-destructive")}>{c.peer.name}</div>
                {sub}
              </div>
              <button
                onClick={() => onCall(c.peer, c.kind)}
                aria-label={c.kind === "video" ? "Видеозвонок" : "Аудиозвонок"}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground active:bg-secondary"
              >
                <Icon name={c.kind === "video" ? "Video" : "Phone"} size={21} />
              </button>
            </div>
          </div>
        );
      })}
      {loaded && all.length > 0 && (
        <p className="px-6 py-5 text-center text-[.78em] text-muted-foreground">
          Всего {all.length} · видео {video} · вместе на связи {totalMin} мин
        </p>
      )}
    </div>
  );
}
